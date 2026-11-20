// Starts the app for a recording: `vite` (dev server) on a free port, or uses DEMO_URL when set
// (e.g. a running `bun run dev`, or `vite preview` of a build).
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

export interface AppServer {
  url: string;
  stop(): void;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

async function waitFor(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`The app did not start at ${url}`);
}

export async function startApp(root: string, mode: 'dev' | 'preview'): Promise<AppServer> {
  if (process.env.DEMO_URL) return { url: process.env.DEMO_URL, stop() {} };
  const port = await freePort();
  const args = mode === 'dev' ? ['vite', '--port', String(port), '--strictPort'] : ['vite', 'preview', '--port', String(port), '--strictPort'];
  const child: ChildProcess = spawn('bunx', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' } });
  let log = '';
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const url = `http://localhost:${port}/`;
  try {
    await waitFor(url, 60_000);
  } catch (e) {
    child.kill();
    console.error(log);
    throw e;
  }
  return { url, stop: () => void child.kill() };
}
