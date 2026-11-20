// A local live-editing session to drive by hand (or by an agent) from a shell: a real designer-sync on
// localhost, the app (vite) in Chromium with Sync on, and a control folder.
//
//   node scripts/demo/watch-live.ts <dir> [--headed] [--agent]
//
// --agent: the phase 4 setup as Henrique uses it: the server gets an API key (generated, in env.sh as
// DESIGNER_SYNC_KEY; the app is given it too) and `designer agent` runs real Claude Code against it (its output in
// <dir>/agent.log; `touch <dir>/agent-stop` / `touch <dir>/agent-start` stop and start it again).
//
// Writes <dir>/env.sh (DESIGNER_SYNC_URL, APP_URL). Then, from a shell:
//   echo <project id> > <dir>/open        the app opens ?open-project=<id> (the id `designer live` printed)
//   echo /path/shot.png > <dir>/shot      screenshot of the app; the file disappears when it is taken
//   echo "Settings 0.9" > <dir>/focus     zoom the canvas to fit that screen's frame (optional zoom factor)
//   cp step.js <dir>/eval                 runs the file as the body of an async function (page, ctx) and writes what
//                                         it returns (JSON) or throws to <dir>/eval.out; `ctx` persists between runs
// Page errors go to <dir>/page-errors.log. Ctrl+C / SIGTERM stops everything.
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { enableSyncBeforeLoad, sleep, startAgent, startSyncServer, type AgentProcess } from './lib/live.ts';
import { startApp } from './lib/server.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(process.argv[2] ?? 'live-session');
mkdirSync(dir, { recursive: true });
const withAgent = process.argv.includes('--agent');
const apiKey = withAgent ? randomBytes(32).toString('hex') : '';
const sync = await startSyncServer(root, join(dir, 'server'), { apiKey });
const app = await startApp(root, 'dev');
writeFileSync(join(dir, 'env.sh'), `export DESIGNER_SYNC_URL=${sync.url}\nexport APP_URL=${app.url}\n${apiKey ? `export DESIGNER_SYNC_KEY=${apiKey}\n` : ''}`, { mode: 0o600 });
let agent: AgentProcess | null = null;
const agentStart = async () => {
  agent = await startAgent(root, { server: sync.url, apiKey, workdir: join(dir, 'agent'), cwd: dir, onLine: (l) => appendFileSync(join(dir, 'agent.log'), `${l}\n`) });
  console.log('agent online');
};
if (withAgent) await agentStart();
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
page.on('pageerror', (e) => appendFileSync(join(dir, 'page-errors.log'), `${new Date().toISOString()} ${e.message}\n`));
page.on('console', (m) => void (m.type() === 'error' && appendFileSync(join(dir, 'page-errors.log'), `${new Date().toISOString()} console: ${m.text()}\n`)));
await enableSyncBeforeLoad(page, sync.url, apiKey);
await page.goto(app.url);
console.log(`sync ${sync.url} · app ${app.url} · control ${dir}`);

let stop = false;
const quit = () => (stop = true);
process.once('SIGINT', quit);
process.once('SIGTERM', quit);
const ctx: Record<string, unknown> = {};
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (...a: string[]) => (...a: unknown[]) => Promise<unknown>;
const take = (f: string) => {
  const v = readFileSync(f, 'utf8').trim();
  rmSync(f);
  return v;
};
while (!stop) {
  try {
    if (existsSync(join(dir, 'open'))) {
      const id = take(join(dir, 'open'));
      await page.goto(`${app.url}?open-project=${encodeURIComponent(id)}`);
      await page.locator('[data-live-by]').waitFor({ timeout: 30_000 }).catch(() => {});
      console.log(`opened ${id}`);
    }
    if (existsSync(join(dir, 'focus'))) {
      const [name, zoom] = take(join(dir, 'focus')).split(/\s+(?=[\d.]+$)/);
      const label = page.getByText(name, { exact: true }).first();
      await label.click({ timeout: 5000 }).catch(() => {});
      await page.keyboard.press('Shift+2').catch(() => {}); // zoom to selection
      if (zoom) console.log(`focus ${name} (${zoom})`);
    }
    if (existsSync(join(dir, 'eval'))) {
      const code = take(join(dir, 'eval'));
      let out: string;
      try {
        out = JSON.stringify(await new AsyncFunction('page', 'ctx', code)(page, ctx), null, 2) ?? 'undefined';
      } catch (e) {
        out = `ERROR ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`;
      }
      writeFileSync(join(dir, 'eval.out'), `${out}\n`);
    }
    if (withAgent && existsSync(join(dir, 'agent-stop'))) {
      rmSync(join(dir, 'agent-stop'));
      await agent?.stop();
      agent = null;
      console.log('agent stopped');
    }
    if (withAgent && existsSync(join(dir, 'agent-start'))) {
      rmSync(join(dir, 'agent-start'));
      if (!agent) await agentStart();
    }
    if (existsSync(join(dir, 'shot'))) {
      const out = take(join(dir, 'shot'));
      await page.screenshot({ path: out });
      console.log(`shot ${out}`);
    }
  } catch (e) {
    console.error(e);
  }
  await sleep(200);
}
await (agent as AgentProcess | null)?.stop();
await browser.close();
app.stop();
sync.stop();
