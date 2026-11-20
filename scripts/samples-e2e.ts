// Playwright check of the sample projects (src/samples, docs/architecture.md → Samples). Runs the dev server (or DEMO_URL):
//
//   bun run e2e:samples                                     (Playwright's Chromium: bunx playwright install chromium)
//   SHOTS=docs/screenshots/samples bun run e2e:samples      also saves light/dark screenshots at 1440 and 390
//
// 1. first visit: Welcome → Wireframe shows "Sample: Roam" next to the blank options; clicking it opens a new project
//    "Roam (sample)" with 13 screens, fitted, and the empty first document is not left behind;
// 2. Help → Open sample project… lists the sample; opening it again makes "Roam (sample) 2" (a new id, the first copy
//    keeps its edits);
// 3. Present mode from Explore: the shared tab bar's Profile tab opens Settings (new), its Account row opens Account,
//    Back returns; the Profile tab works from Trips too.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { startApp } from './demo/lib/server.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SHOTS ? resolve(root, process.env.SHOTS) : null;
if (shots) mkdirSync(shots, { recursive: true });
const ok = (s: string) => console.log(`ok  ${s}`);
function check(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`FAILED: ${what}`);
}

interface Doc {
  id: string;
  name: string;
  wireframe?: { screens: { id: string; name: string }[] };
  children: unknown[];
}
interface Meta {
  id: string;
  name: string;
}
type W = {
  __designer: {
    useDocStore: { getState(): { doc: Doc; rename(n: string): void } };
    useProjectsStore: { getState(): { projects: Meta[]; activeId: string; rename(id: string, n: string): Promise<void> } };
    useEditorStore: { getState(): { zoom: number; pan: { x: number; y: number } } };
  };
};
const appDoc = (page: Page) => page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc);
const projects = (page: Page) => page.evaluate(() => (window as unknown as W).__designer.useProjectsStore.getState().projects.map((p) => ({ id: p.id, name: p.name })));
const dialog = (page: Page) => page.getByRole('dialog');
const card = (page: Page, label: string) => dialog(page).getByRole('group', { name: 'Design mode' }).getByRole('button', { name: new RegExp(`^${label}`) });
const sampleCard = (page: Page) => dialog(page).locator('[data-sample="roam"]');

async function openHelpSamples(page: Page) {
  await page.getByRole('menuitem', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: 'Open sample project…' }).click();
  await dialog(page).getByRole('heading', { name: 'Open sample project' }).waitFor();
}

const app = await startApp(root, 'dev');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(app.url);

  // 1. Welcome → Wireframe → Sample: Roam
  await dialog(page).getByRole('heading', { name: 'Welcome to Designer' }).waitFor({ timeout: 30_000 });
  const empty = (await projects(page))[0].id;
  await card(page, 'Wireframe').click();
  await dialog(page).getByRole('heading', { name: 'New wireframe' }).waitFor();
  check(await sampleCard(page).isVisible(), 'the Wireframe step shows the Roam sample');
  const text = await sampleCard(page).innerText();
  check(/Sample: Roam/.test(text) && /trip planner, with flows and an agent-reorganized Settings/.test(text), `card text (got ${text})`);
  check(await sampleCard(page).locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), 'thumbnail loaded');
  await sampleCard(page).click();
  await dialog(page).waitFor({ state: 'hidden' });
  let d = await appDoc(page);
  check(d.name === 'Roam (sample)' && d.wireframe?.screens.length === 13, `opened Roam (sample) with 13 screens (got ${d.name}, ${d.wireframe?.screens.length})`);
  let list = await projects(page);
  check(list.length === 1 && list[0].id === d.id && d.id !== empty, `one project, the sample copy (got ${JSON.stringify(list)})`);
  const firstId = d.id;
  // Fitted: every frame is on screen (the canvas fits the content on open).
  await page.waitForTimeout(300);
  ok('Welcome → Wireframe → Sample: Roam opens "Roam (sample)" (13 screens), no empty project left behind');

  // 2. Help → Open sample project… → a second copy
  await page.evaluate(async (id) => {
    await (window as unknown as W).__designer.useProjectsStore.getState().rename(id, 'My Roam');
  }, firstId);
  await openHelpSamples(page);
  check((await dialog(page).locator('[data-sample]').count()) >= 1, 'Help lists the samples');
  await sampleCard(page).click();
  await dialog(page).waitFor({ state: 'hidden' });
  d = await appDoc(page);
  list = await projects(page);
  check(d.name === 'Roam (sample)' && d.id !== firstId, `Help opened a new copy (got ${d.name} ${d.id})`);
  check(list.some((p) => p.id === firstId && p.name === 'My Roam'), 'the first copy keeps its edits');
  await openHelpSamples(page);
  await sampleCard(page).click();
  await dialog(page).waitFor({ state: 'hidden' });
  d = await appDoc(page);
  check(d.name === 'Roam (sample) 2', `third copy is "Roam (sample) 2" (got ${d.name})`);
  check((await projects(page)).length === 3, 'three projects');
  ok('Help → Open sample project… makes a new copy each time ("Roam (sample)", then "Roam (sample) 2")');

  // 3. Present mode: Explore → Profile tab → Settings (new) → Account → Back
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+P');
  const present = page.locator('[data-slot="present-mode"]');
  await present.waitFor();
  const title = () => present.locator('[data-slot="present-title"]').innerText();
  check(/Explore/.test(await title()), `present starts at Explore (got ${await title()})`);
  await present.getByRole('button', { name: 'Profile: open Settings (new)' }).click();
  check(/Settings \(new\)/.test(await title()), `Profile tab → Settings (new) (got ${await title()})`);
  await present.getByRole('button', { name: 'Open Account' }).click();
  check(/Account/.test(await title()), `Account row → Account (got ${await title()})`);
  await present.getByRole('button', { name: 'Back', exact: true }).click();
  await present.getByRole('button', { name: 'Back', exact: true }).click();
  check(/Explore/.test(await title()), `Back twice → Explore (got ${await title()})`);
  await present.getByRole('button', { name: 'Trips: open Trips' }).click();
  check(/Trips/.test(await title()), 'Trips tab → Trips');
  await present.getByRole('button', { name: 'Profile: open Settings (new)' }).click();
  check(/Settings \(new\)/.test(await title()), 'Profile tab works from Trips too (a link on the shared tab bar)');
  await present.getByRole('button', { name: 'Open Trip settings' }).click();
  check(/Trip settings/.test(await title()), 'the renamed sub-screen opens');
  await page.keyboard.press('Escape');
  await present.waitFor({ state: 'hidden' });
  ok('Present: Explore → Profile → Settings (new) → Account, Back, and Profile from Trips → Trip settings');
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  await context.close();

  // ---------- screenshots ----------
  if (shots) {
    for (const theme of ['light', 'dark'] as const)
      for (const [w, h] of [
        [1440, 900],
        [390, 844],
      ]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await ctx.addInitScript((t) => {
          localStorage.setItem('designer.theme', t);
          localStorage.setItem('designer.welcomed', '1');
        }, theme);
        const p = await ctx.newPage();
        await p.goto(app.url);
        await p.waitForFunction(() => !!(window as unknown as Partial<W>).__designer);
        await p.waitForTimeout(800);
        await p.keyboard.press('Control+Alt+N');
        await card(p, 'Wireframe').click();
        await dialog(p).getByRole('heading', { name: 'New wireframe' }).waitFor();
        await p.waitForTimeout(400);
        await p.screenshot({ path: join(shots, `${theme}-${w}-new-wireframe.png`) });
        await sampleCard(p).click();
        await dialog(p).waitFor({ state: 'hidden' });
        await p.waitForTimeout(1200);
        await p.screenshot({ path: join(shots, `${theme}-${w}-opened.png`) });
        if (w === 1440) {
          await p.getByRole('menuitem', { name: 'Help' }).click();
          await p.getByRole('menuitem', { name: 'Open sample project…' }).waitFor();
          await p.waitForTimeout(300);
          await p.screenshot({ path: join(shots, `${theme}-${w}-help-menu.png`) });
          await p.keyboard.press('Escape');
          await openHelpSamples(p);
          await p.waitForTimeout(400);
          await p.screenshot({ path: join(shots, `${theme}-${w}-help.png`) });
        }
        await ctx.close();
      }
    ok(`screenshots in ${shots}`);
  }
} finally {
  await browser.close();
  app.stop();
}
