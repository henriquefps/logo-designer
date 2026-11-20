// bun run demo [name…]: records the scenarios in scripts/demo/scenarios (all, or the ones whose
// file name contains one of the arguments) into demo-out/<name>.mp4. See scripts/demo/README.md.
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Demo } from './lib/demo.ts';
import { duration, encodeMp4 } from './lib/encode.ts';
import { installOverlay } from './lib/overlay.ts';
import type { Scenario } from './lib/scenario.ts';
import { startApp } from './lib/server.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = resolve(root, process.env.DEMO_OUT ?? 'demo-out');
const WIDTH = 1280;
const APP_HEIGHT = 800;
const CAPTION = 40;
const FPS = 25;

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const preview = args.includes('--preview');
const filters = args.filter((a) => !a.startsWith('--'));

const files = readdirSync(join(here, 'scenarios'))
  .filter((f) => /^\d\d-.*\.ts$/.test(f))
  .filter((f) => !filters.length || filters.some((q) => f.includes(q)))
  .sort();
if (!files.length) {
  console.error(`No scenario matches ${filters.join(', ')}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const app = await startApp(root, preview ? 'preview' : 'dev');
const browser = await chromium.launch({ headless: !headed });
let failed = 0;
try {
  for (const file of files) {
    const scenario = (await import(join(here, 'scenarios', file))).default as Scenario;
    const rawDir = join(outDir, '.raw', scenario.name);
    rmSync(rawDir, { recursive: true, force: true });
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: APP_HEIGHT + CAPTION },
      deviceScaleFactor: 1,
      permissions: ['clipboard-read', 'clipboard-write'],
      recordVideo: { dir: rawDir, size: { width: WIDTH, height: APP_HEIGHT + CAPTION } },
    });
    await context.addInitScript(installOverlay, { captionHeight: CAPTION });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    const demo = new Demo({ page, captionHeight: CAPTION, fast: true });
    const t0 = Date.now();
    let error: unknown = null;
    try {
      await page.goto(app.url);
      if (scenario.setup) await scenario.setup(demo);
      await demo.begin(scenario.steps);
      await scenario.run(demo);
      await demo.pause(1200);
    } catch (e) {
      error = e;
      await page.screenshot({ path: join(outDir, `${scenario.name}.error.png`) }).catch(() => {});
    }
    const video = page.video();
    await context.close();
    await scenario.teardown?.().catch((e: unknown) => console.error(`  teardown: ${e instanceof Error ? e.message : String(e)}`));
    const raw = video ? await video.path() : null;
    const startSec = (demo.startedAt ?? 0) / 1000;
    if (raw) {
      const webm = join(outDir, `${scenario.name}.webm`);
      renameSync(raw, webm);
      const mp4 = join(outDir, `${scenario.name}.mp4`);
      const speed = demo.speedSegments.map((x) => ({ start: x.start / 1000, end: x.end / 1000, factor: x.factor }));
      encodeMp4({ input: webm, output: mp4, start: startSec, fps: FPS, speed });
      const kb = Math.round(statSync(mp4).size / 1024);
      if (demo.chapters.length) {
        // Video time of each chapter card: the cut setup and the sped-up parts before it taken out.
        const at = (ms: number) => {
          let t = ms / 1000 - startSec;
          for (const s of speed) if (s.start < ms / 1000) t -= (Math.min(s.end, ms / 1000) - s.start) * (1 - 1 / s.factor);
          return t;
        };
        const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
        const lines = demo.chapters.map((c) => `${fmt(at(c.at))}  ${c.num ? `${c.num}. ` : ''}${c.title}`);
        writeFileSync(join(outDir, `${scenario.name}.chapters.txt`), `${lines.join('\n')}\n`);
        console.log(lines.map((l) => `  ${l}`).join('\n'));
      }
      console.log(`${scenario.name}.mp4  ${duration(mp4).toFixed(1)} s  ${kb} KB  (recorded in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    rmSync(rawDir, { recursive: true, force: true });
    if (errors.length) console.log(`  page errors:\n    ${errors.join('\n    ')}`);
    if (error) {
      failed += 1;
      console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await browser.close();
  app.stop();
}
process.exit(failed ? 1 : 0);
