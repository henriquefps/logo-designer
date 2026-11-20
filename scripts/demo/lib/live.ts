// Live editing helpers shared by scripts/live-e2e.ts and the demo scenario 07: a real designer-sync
// (built from sync-server/ with Go), the `designer` CLI (`designer live` running in the background),
// file edits made the way an agent makes them, and turning Sync on in the app.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { Page } from 'playwright';

export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitUntil(what: string, cond: () => boolean | Promise<boolean>, ms = 10_000, every = 25): Promise<number> {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error(`Timed out after ${ms} ms waiting for ${what}`);
    await sleep(every);
  }
  return Date.now() - t0;
}

export interface SyncServer {
  url: string;
  dataDir: string;
  log: () => string;
  stop(): void;
}

/** Builds sync-server/ into `dir` and runs it on a free port with its data in `dir/data` (no API key: loopback only). */
export async function startSyncServer(root: string, dir: string): Promise<SyncServer> {
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, 'designer-sync');
  const built = spawnSync('go', ['build', '-o', bin, '.'], { cwd: join(root, 'sync-server'), encoding: 'utf8' });
  if (built.status !== 0) throw new Error(`go build failed:\n${built.stderr}`);
  const port = await freePort();
  const dataDir = join(dir, 'data');
  const child = spawn(bin, ['--port', String(port), '--data-dir', dataDir], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const url = `http://localhost:${port}`;
  await waitUntil('designer-sync to start', async () => {
    try {
      return (await fetch(`${url}/api/health`)).ok;
    } catch {
      return false;
    }
  });
  return { url, dataDir, log: () => log, stop: () => void child.kill() };
}

/** Runs the `designer` CLI (bun bin/designer.ts) and returns its output; throws on a non-zero exit. */
export function designer(root: string, args: string[], cwd: string): string {
  const r = spawnSync('bun', [join(root, 'bin/designer.ts'), ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`designer ${args.join(' ')} failed (${r.status}):\n${r.stdout}${r.stderr}`);
  return `${r.stdout}${r.stderr}`.trim();
}

export interface LiveProcess {
  id: string;
  /** Everything it printed so far, one entry per line. */
  lines: string[];
  waitForLine(re: RegExp, ms?: number): Promise<string>;
  /** Ctrl+C, then waits for it to exit (it clears the live mark on the way out). */
  stop(): Promise<void>;
}

/** Starts `designer live <file> --server <url>` and waits until it has pushed the file. */
export async function startLive(root: string, file: string, server: string, origin: string, cwd: string): Promise<LiveProcess> {
  const child: ChildProcess = spawn('bun', [join(root, 'bin/designer.ts'), 'live', file, '--server', server, '--origin', origin], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines: string[] = [];
  let exited = false;
  const exit = new Promise<void>((r) => child.once('exit', () => ((exited = true), r())));
  const take = (d: Buffer) => lines.push(...String(d).split('\n').filter(Boolean));
  child.stdout?.on('data', take);
  child.stderr?.on('data', take);
  const waitForLine = async (re: RegExp, ms = 10_000) => {
    await waitUntil(`designer live to print ${re}`, () => exited || lines.some((l) => re.test(l)), ms);
    const hit = lines.find((l) => re.test(l));
    if (!hit) throw new Error(`designer live exited:\n${lines.join('\n')}`);
    return hit;
  };
  const head = await waitForLine(/^Live: .*\((\S+)\)/, 20_000);
  const id = /\((\S+)\) ↔/.exec(head)![1];
  return {
    id,
    lines,
    waitForLine,
    stop: async () => {
      if (!exited) child.kill('SIGINT');
      await exit;
    },
  };
}

type Json = Record<string, unknown>;

/** An agent's edit: read the project file, change it, write it back (as `wf build --into` or a script would). */
export function editProject(file: string, change: (doc: Json) => void): void {
  const doc = JSON.parse(readFileSync(file, 'utf8')) as Json;
  change(doc);
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

export const readProject = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Json & { name: string; children: Json[]; wireframe: { screens: { id: string; name: string }[] } };

/** A library component instance appended to the screen frame called `screen` (the app fills in its children). */
export function addComponent(doc: Json, screen: string, kind: string, props: Json, name = kind): void {
  const frame = (doc.children as Json[]).find((c) => c.name === screen && c.screen);
  if (!frame) throw new Error(`no screen frame “${screen}”`);
  const kids = frame.children as Json[];
  const bottom = kids.reduce((y, k) => Math.max(y, ((k.transform as Json | undefined)?.y as number | undefined) ?? 0), 0);
  kids.push({ type: 'group', name, transform: { x: 0, y: kids.length ? bottom + 64 : 96 }, component: { kind, props }, children: [] });
}

/** Turns Sync on in the app (the same settings File → Sync… stores), before the app loads. */
export async function enableSyncBeforeLoad(page: Page, url: string): Promise<void> {
  await page.addInitScript((u) => {
    if (!localStorage.getItem('designer.sync')) {
      localStorage.setItem('designer.sync', JSON.stringify({ enabled: true, url: u, apiKey: '', syncFonts: false }));
      localStorage.setItem('designer.welcomed', '1');
    }
  }, url);
}

export const ensureDir = (dir: string) => (existsSync(dir) ? dir : (mkdirSync(dir, { recursive: true }), dir));
