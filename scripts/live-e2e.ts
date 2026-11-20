// End-to-end check of live editing (docs/sync.md → Live editing), against the real pieces: designer-sync
// built from sync-server/, the app in Chromium (Playwright) with Sync on, and `designer live` on a file.
//
//   bun run e2e:live            (needs Go, and Playwright's Chromium: bunx playwright install chromium)
//   DEMO_URL=http://localhost:5173/ bun run e2e:live    against an app that is already running
//
// 1. the agent edits the file → the change is in the app within ~1 s;
// 2. Henrique edits in the app → the file is rewritten;
// 3. conflict, the CLI's edit is newer (the app was offline): the app takes it and keeps its own edit as a
//    "conflicted copy" project;
// 4. conflict, the app's edit is newer: the file takes it, the server archives the CLI's version;
// 5. Ctrl+C on `designer live` clears the Live mark in the app;
// 6. the app is already open on another project when `?open-project=` opens the live one and the agent runs
//    `wf build --into` right away: the build survives (the old project's pending autosave used to be saved
//    into the live project as an app edit, newer than the build, and the file lost every screen).
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { startApp } from './demo/lib/server.ts';
import { addComponent, designer, editProject, enableSyncBeforeLoad, readProject, startLive, startSyncServer, waitUntil, type LiveProcess, type SyncServer } from './demo/lib/live.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'designer-live-e2e-'));
const file = join(work, 'hoard.designer.json');
const results: string[] = [];
const ok = (s: string) => {
  results.push(`ok  ${s}`);
  console.log(`ok  ${s}`);
};

/** The app's view of the open document (dev builds expose the stores as window.__designer, read only here). */
const appDoc = (page: Page) =>
  page.evaluate(() => {
    const d = (window as unknown as { __designer: { useDocStore: { getState(): { doc: { name: string; wireframe?: { screens: { name: string }[] }; children: { name: string; children: { name: string }[] }[] } } } } }).__designer.useDocStore.getState().doc;
    return { name: d.name, screens: d.wireframe?.screens.map((s) => s.name) ?? [], components: d.children.flatMap((c) => c.children.map((k) => k.name)) };
  });
const projectNames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __designer: { useProjectsStore: { getState(): { projects: { name: string }[] } } } }).__designer.useProjectsStore.getState().projects.map((p) => p.name));

/** Henrique renames the open project: Projects dialog → ⋯ → Rename → type → Enter. */
async function renameProject(page: Page, from: string, to: string): Promise<number> {
  await page.getByTitle('Projects').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: `Actions for ${from}` }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = dialog.getByLabel('Project name');
  await input.fill(to);
  await input.press('Enter');
  const at = Date.now();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  return at;
}

let server: SyncServer | null = null;
let live: LiveProcess | null = null;
const app = await startApp(root, 'dev');
const browser = await chromium.launch();
let failed = false;
try {
  server = await startSyncServer(root, join(work, 'server'));
  console.log(`designer-sync ${server.url}, app ${app.url}, files in ${work}`);

  // The agent's project: a wireframe with a Settings screen, made with the CLI.
  designer(root, ['new', '--preset', 'wireframe', '--name', 'Hoard', '-o', file], work);
  designer(root, ['screen', file, '--name', 'Settings'], work);
  // A top app bar: its icons are placeholders in a CLI file, which the app fills in on open.
  editProject(file, (d) => addComponent(d, 'Settings', 'top-app-bar', { title: 'Settings' }, 'Top app bar'));
  live = await startLive(root, file, server.url, app.url, work);
  ok(`designer live started: ${live.lines[0]}`);

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await enableSyncBeforeLoad(page, server.url);
  await page.goto(`${app.url}?open-project=${live.id}`);
  const t0 = Date.now();
  await waitUntil('the project to open in the app', async () => (await appDoc(page).catch(() => null))?.name === 'Hoard', 30_000);
  ok(`?open-project opened the synced project in ${Date.now() - t0} ms`);
  const indicator = page.locator('[data-live-by]');
  await indicator.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500); // opening (and filling in icons) is not an edit: nothing is pushed back
  if ((await indicator.getAttribute('data-live-by')) !== 'cli' || live.count(/↓ pulled/) !== 0) throw new Error('opening the project in the app must not count as an edit');
  ok('Live indicator shown, last change by the CLI; opening it did not push anything back');
  await waitUntil('the event stream', async () => (await page.evaluate(() => (window as unknown as { __designer: { sync: { useSyncStore: { getState(): { stream: string } } } } }).__designer.sync.useSyncStore.getState().stream)) === 'open');

  // 1. The agent edits the file.
  editProject(file, (d) => addComponent(d, 'Settings', 'list-row', { title: 'Language', trailing: 'value', value: 'English' }, 'Language row'));
  const fileToApp = await waitUntil('the agent’s list row in the app', async () => (await appDoc(page)).components.includes('Language row'), 5_000);
  if (fileToApp > 1500) throw new Error(`file → app took ${fileToApp} ms (expected about 1 s)`);
  ok(`file edit → app in ${fileToApp} ms`);
  designer(root, ['screen', file, '--name', 'Profile'], work);
  const screenToApp = await waitUntil('the Profile screen in the app', async () => (await appDoc(page)).screens.includes('Profile'), 5_000);
  ok(`designer screen --name Profile → app in ${screenToApp} ms`);
  if ((await indicator.getAttribute('data-live-by')) !== 'cli') throw new Error('the Live indicator should name the CLI');
  ok('Live indicator: last change by the CLI');

  // 2. Henrique edits in the app (real input: the Projects dialog renames the project).
  const enter = await renameProject(page, 'Hoard', 'Hoard (Henrique)');
  await waitUntil('the rename in the file', () => readProject(file).name === 'Hoard (Henrique)', 5_000, 10);
  const appToFile = Date.now() - enter;
  if (appToFile > 1500) throw new Error(`app → file took ${appToFile} ms (expected about 1 s)`);
  ok(`app edit (Enter in the rename field) → file in ${appToFile} ms`);
  await live.waitForLine(/↓ pulled .*edited in the app/);
  await waitUntil('the indicator to say this device', async () => (await indicator.getAttribute('data-live-by')) === 'this-device', 3_000);
  ok('Live indicator: last change by this device');

  // 3. Conflict, the CLI is newer: the app edits offline, then the agent edits the file.
  await context.setOffline(true);
  await renameProject(page, 'Hoard (Henrique)', 'Offline rename');
  await page.waitForTimeout(1200); // autosaved on the device, the push fails (offline)
  const PUSHED = /↑ pushed \(file changed\)/;
  let n = live.count(PUSHED);
  editProject(file, (d) => addComponent(d, 'Settings', 'list-row', { title: 'Backup', trailing: 'chevron' }, 'Backup row'));
  await live.waitForNew(PUSHED, n);
  await page.waitForTimeout(300);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitUntil('the CLI’s version in the app', async () => (await appDoc(page)).components.includes('Backup row'), 10_000);
  await waitUntil('the conflicted copy', async () => (await projectNames(page)).some((n) => n.startsWith('Offline rename (conflicted copy')), 10_000);
  if (readProject(file).name !== 'Hoard (Henrique)') throw new Error(`the file should keep the newer CLI version, has “${readProject(file).name}”`);
  ok('conflict (CLI newer): the app shows the CLI version and keeps “Offline rename (conflicted copy …)” in Projects; the file is unchanged');

  // 4. Conflict, the app is newer: the agent's file edit lands while the app is offline, then the app edits later.
  await context.setOffline(true);
  n = live.count(PUSHED);
  editProject(file, (d) => addComponent(d, 'Settings', 'list-row', { title: 'Theme' }, 'Theme row'));
  await live.waitForNew(PUSHED, n);
  const pushes = live.lines.filter((l) => l.includes('↑ pushed')).length;
  await page.waitForTimeout(200);
  await renameProject(page, 'Hoard (Henrique)', 'Hoard (newest)');
  await page.waitForTimeout(800);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitUntil('the app’s newer version in the file', () => readProject(file).name === 'Hoard (newest)', 10_000);
  const archive = join(server.dataDir, 'conflicts', 'projects', live.id);
  const archived = readdirSync(archive);
  if (!archived.length) throw new Error('the server should have archived the overwritten CLI version');
  if (live.lines.filter((l) => l.includes('↑ pushed')).length !== pushes) throw new Error('the CLI should not push back what it pulled');
  ok(`conflict (app newer): the file has the app's version; the server archived the CLI's in conflicts/projects/${live.id}/ (${archived.length} file(s))`);

  // 5. Stop: the Live mark goes away in the app.
  await live.stop();
  await waitUntil('the Live indicator to disappear', async () => (await indicator.count()) === 0, 10_000);
  ok(`designer live stopped (${live.lines.at(-1)}); the Live indicator is gone`);
  await context.close();

  // 6. The app is already open (another project) when the agent's project is opened and built into.
  const spec = join(work, 'two.spec.json');
  writeFileSync(spec, JSON.stringify({ name: 'Race', screens: [{ name: 'Gallery', root: [{ heading: 'Gallery' }] }, { name: 'Settings', root: [{ 'list-row': 'Language' }] }] }));
  for (const delay of [0, 300, 800]) {
    const f = join(work, `race-${delay}.designer.json`);
    designer(root, ['new', '--preset', 'wireframe', '--name', `Race ${delay}`, '-o', f], work);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    await enableSyncBeforeLoad(pg, server.url);
    await pg.goto(app.url);
    await pg.waitForTimeout(3000);
    const l = await startLive(root, f, server.url, app.url, work);
    await pg.waitForTimeout(3000); // the app pulls it into its list
    const opening = pg.goto(`${app.url}?open-project=${l.id}`);
    await pg.waitForTimeout(delay);
    designer(root, ['wf', 'build', spec, '--into', f], work);
    await opening;
    await pg.waitForTimeout(4000);
    const screens = readProject(f).wireframe.screens.length;
    const pulled = l.count(/↓ pulled/);
    await l.stop();
    await ctx.close();
    if (screens !== 2 || pulled) throw new Error(`opened while building (${delay} ms): the file has ${screens} screens, ${pulled} pull(s) from the app (expected 2 and 0)`);
  }
  ok('opening the project while the agent builds (0 / 300 / 800 ms apart, the app already open): the build survives, nothing comes back from the app');
} catch (e) {
  failed = true;
  console.error(`FAILED: ${e instanceof Error ? e.stack : e}`);
  if (live) console.error(`designer live output:\n  ${live.lines.join('\n  ')}`);
  if (server) console.error(`server log (tail):\n${server.log().split('\n').slice(-15).join('\n')}`);
} finally {
  await live?.stop().catch(() => {});
  await browser.close();
  server?.stop();
  app.stop();
}
console.log(failed ? 'live e2e: FAILED' : `live e2e: ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
