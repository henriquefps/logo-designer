// Develops a long scenario one chapter at a time against a live app (no recording): the browser, the overlay and the
// scenario's state stay up between commands, the scenario file is re-imported for each one.
//
//   node scripts/demo/dev-scenario.ts <scenario file> <dir> [--headed]
//   echo setup > <dir>/cmd          runs the scenario's setup (state kept)
//   echo "ch 3" > <dir>/cmd         runs chapter 3 (`chapters[2]` of the scenario module), fast unless "ch 3 slow"
//   echo "eval x.js" > <dir>/cmd    runs a file as the body of an async function (page, demo, st)
//   echo quit > <dir>/cmd           teardown and exit
// After each command: <dir>/out.txt (result or error) and <dir>/shot.png. Ctrl+C stops (teardown runs).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { Demo } from './lib/demo.ts';
import { overlayOptions } from './lib/hfps.ts';
import { installOverlay } from './lib/overlay.ts';
import type { Scenario } from './lib/scenario.ts';
import { startApp } from './lib/server.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const file = resolve(process.argv[2]);
const dir = resolve(process.argv[3] ?? 'dev-scenario');
const app = await startApp(root, 'dev');
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const load = async () => (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as { default: { video?: Scenario['video']; setup?(d: Demo, st?: unknown): Promise<void>; teardown?(st?: unknown): Promise<void> }; chapters: { run(d: Demo, st: unknown): Promise<void> }[] };
// The scenario's own size and palette (scenario.video), as `run.ts` records it.
const video = (await load()).default.video ?? {};
const caption = video.captionHeight ?? 40;
const context = await browser.newContext({ viewport: { width: video.width ?? 1280, height: (video.appHeight ?? 800) + caption }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
await context.addInitScript(installOverlay, overlayOptions(caption, video.palette));
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`page error: ${e.message}`));
page.on('console', (m) => void (m.type() === 'error' && console.log(`console: ${m.text()}`)));
await page.goto(app.url);
const demo = new Demo({ page, captionHeight: caption, fast: true });
const st: Record<string, unknown> = {};
console.log(`app ${app.url} · control ${dir}`);
let stop = false;
const quit = () => (stop = true);
process.once('SIGINT', quit);
process.once('SIGTERM', quit);
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (...a: string[]) => (...a: unknown[]) => Promise<unknown>;
while (!stop) {
  const cmdFile = join(dir, 'cmd');
  if (existsSync(cmdFile)) {
    const cmd = readFileSync(cmdFile, 'utf8').trim();
    rmSync(cmdFile);
    const t0 = Date.now();
    let out = '';
    try {
      const [verb, arg, mode] = cmd.split(/\s+/);
      if (verb === 'quit') stop = true;
      else if (verb === 'setup') await (await load()).default.setup?.(demo, st);
      else if (verb === 'ch') {
        demo.fast = mode !== 'slow';
        // Slow runs also leave a screenshot every 1.5 s in <dir>/frames (to look at the middle of a chapter).
        const frames = join(dir, 'frames');
        rmSync(frames, { recursive: true, force: true });
        mkdirSync(frames, { recursive: true });
        let k = 0;
        const timer = demo.fast ? null : setInterval(() => void page.screenshot({ path: join(frames, `${String(k++).padStart(3, '0')}.png`) }).catch(() => {}), 1500);
        try {
          await (await load()).chapters[Number(arg) - 1].run(demo, st);
        } finally {
          if (timer) clearInterval(timer);
          demo.fast = true;
        }
      } else if (verb === 'eval') out = JSON.stringify(await new AsyncFunction('page', 'demo', 'st', readFileSync(resolve(dir, arg), 'utf8'))(page, demo, st), null, 1) ?? '';
      out = `ok ${cmd} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n${out}`;
    } catch (e) {
      out = `FAILED ${cmd}: ${e instanceof Error ? e.stack : String(e)}`;
    }
    await page.screenshot({ path: join(dir, 'shot.png') }).catch(() => {});
    writeFileSync(join(dir, 'out.txt'), out);
    console.log(out.split('\n')[0]);
  }
  await new Promise((r) => setTimeout(r, 200));
}
await (await load()).default.teardown?.(st).catch(() => {});
await browser.close();
app.stop();
process.exit(0);
