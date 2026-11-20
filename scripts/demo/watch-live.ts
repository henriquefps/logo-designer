// A local live-editing session to drive by hand (or by an agent) from a shell: a real designer-sync on
// localhost, the app (vite) in Chromium with Sync on, and a control folder.
//
//   node scripts/demo/watch-live.ts <dir> [--headed]
//
// Writes <dir>/env.sh (DESIGNER_SYNC_URL, APP_URL). Then, from a shell:
//   echo <project id> > <dir>/open        the app opens ?open-project=<id> (the id `designer live` printed)
//   echo /path/shot.png > <dir>/shot      screenshot of the app; the file disappears when it is taken
//   echo "Settings 0.9" > <dir>/focus     zoom the canvas to fit that screen's frame (optional zoom factor)
// Page errors go to <dir>/page-errors.log. Ctrl+C / SIGTERM stops everything.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { enableSyncBeforeLoad, sleep, startSyncServer } from './lib/live.ts';
import { startApp } from './lib/server.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(process.argv[2] ?? 'live-session');
mkdirSync(dir, { recursive: true });
const sync = await startSyncServer(root, join(dir, 'server'));
const app = await startApp(root, 'dev');
writeFileSync(join(dir, 'env.sh'), `export DESIGNER_SYNC_URL=${sync.url}\nexport APP_URL=${app.url}\n`);
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => appendFileSync(join(dir, 'page-errors.log'), `${new Date().toISOString()} ${e.message}\n`));
page.on('console', (m) => void (m.type() === 'error' && appendFileSync(join(dir, 'page-errors.log'), `${new Date().toISOString()} console: ${m.text()}\n`)));
await enableSyncBeforeLoad(page, sync.url);
await page.goto(app.url);
console.log(`sync ${sync.url} · app ${app.url} · control ${dir}`);

let stop = false;
const quit = () => (stop = true);
process.once('SIGINT', quit);
process.once('SIGTERM', quit);
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
await browser.close();
app.stop();
sync.stop();
