// Playwright check of the New document dialog (docs/architecture.md → New document): two steps, the
// three design modes as equal cards, then the chosen mode's options. Runs the dev server (or DEMO_URL):
//
//   bun run e2e:new-document                                 (Playwright's Chromium: bunx playwright install chromium)
//   SHOTS=docs/screenshots/new-document bun run e2e:new-document    also saves light/dark screenshots at 390/1024/1440
//
// 1. first visit: the welcome dialog opens by itself on the three cards, none preselected; arrows + Enter
//    pick Wireframe, Enter on step 2 creates a wireframe with one phone screen;
// 2. File → New (Ctrl+Alt+N) → App icon → Create: an icon document with the app-icon preset;
// 3. File → New → App icon → iOS + circle → Create: the options reach the document;
// 4. File → New → Free project → Create: a 1024 × 1024 artboard; → OG image: 1200 × 630; → custom 800 × 600;
// 5. File → New → Wireframe → Desktop + a name → Create; Back returns to the cards; Esc closes.
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
  name: string;
  artboard: { width: number; height: number };
  icon?: { preset: string; shape: string };
  wireframe?: { screens: unknown[] };
  children: { screen?: { platform: string } }[];
}
type W = { __designer: { useDocStore: { getState(): { doc: Doc } }; useProjectsStore: { getState(): { projects: unknown[] } } } };
const appDoc = (page: Page) => page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc);
const projectCount = (page: Page) => page.evaluate(() => (window as unknown as W).__designer.useProjectsStore.getState().projects.length);
const platforms = (d: Doc) => d.children.filter((c) => c.screen).map((c) => c.screen!.platform);

const dialog = (page: Page) => page.getByRole('dialog');
const card = (page: Page, label: string) => dialog(page).getByRole('group', { name: 'Design mode' }).getByRole('button', { name: new RegExp(`^${label}`) });

async function openNew(page: Page) {
  await page.keyboard.press('Control+Alt+N');
  await dialog(page).getByRole('heading', { name: 'New document' }).waitFor();
}

async function waitClosed(page: Page) {
  await dialog(page).waitFor({ state: 'hidden' });
}

const app = await startApp(root, 'dev');
const browser = await chromium.launch();
try {
  // ---------- the checks ----------
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(app.url);

  // 1. welcome, keyboard only
  await dialog(page).getByRole('heading', { name: 'Welcome to Designer' }).waitFor({ timeout: 30_000 });
  const cards = await dialog(page).getByRole('group', { name: 'Design mode' }).getByRole('button').allTextContents();
  check(cards.length === 3 && cards[0].startsWith('App icon') && cards[1].startsWith('Wireframe') && cards[2].startsWith('Free project'), `three cards in order (got ${cards.join(' | ')})`);
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-mode') ?? null);
  check((await focused()) === null, 'no card is preselected when the dialog opens');
  await page.keyboard.press('ArrowRight');
  check((await focused()) === 'icon', 'the first arrow focuses the first card');
  await page.keyboard.press('ArrowRight');
  check((await focused()) === 'wireframe', 'ArrowRight moves to Wireframe');
  await page.keyboard.press('Enter');
  await dialog(page).getByRole('heading', { name: 'New wireframe' }).waitFor();
  check((await dialog(page).getByRole('radio', { name: /Phone/ }).isChecked()) === true, 'Phone is the default first screen');
  const before = await projectCount(page);
  await page.keyboard.press('Enter');
  await waitClosed(page);
  let d = await appDoc(page);
  check(d.wireframe && d.wireframe.screens.length === 1 && platforms(d).join() === 'phone' && !d.icon, 'Wireframe: one phone screen');
  check((await projectCount(page)) === before, 'the empty first document was reused');
  ok('welcome → Wireframe with the keyboard: one phone screen, no extra project');

  // 2. App icon with the defaults
  await openNew(page);
  await card(page, 'App icon').click();
  await dialog(page).getByRole('heading', { name: 'New app icon' }).waitFor();
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await waitClosed(page);
  d = await appDoc(page);
  check(d.icon?.preset === 'app-icon' && d.icon.shape === 'auto' && d.artboard.width === 128 && !d.wireframe, `App icon defaults (got ${JSON.stringify(d.icon)})`);
  ok('File → New → App icon → Create: app-icon preset, 128 × 128');

  // 3. App icon with options
  await openNew(page);
  await card(page, 'App icon').click();
  await dialog(page).getByText('iOS', { exact: true }).click();
  await dialog(page).getByRole('combobox', { name: 'Glyph shape' }).click();
  await page.getByRole('option', { name: /Circle/ }).click();
  await dialog(page).getByLabel('Name').fill('Weather');
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await waitClosed(page);
  d = await appDoc(page);
  check(d.icon?.preset === 'ios' && d.icon.shape === 'circle' && d.artboard.width === 1024 && d.name === 'Weather', `App icon options (got ${JSON.stringify({ name: d.name, icon: d.icon })})`);
  ok('App icon → iOS, circle, named: kept on the document');

  // 4. Free project: default, a preset (double-click creates), a custom size
  await openNew(page);
  await card(page, 'Free project').click();
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await waitClosed(page);
  d = await appDoc(page);
  check(d.artboard.width === 1024 && d.artboard.height === 1024 && !d.icon && !d.wireframe, 'Free project default 1024 × 1024');
  // (the new free document is empty, so the next one reuses it)
  await openNew(page);
  await card(page, 'Free project').click();
  await dialog(page).getByText('OG image').dblclick();
  await waitClosed(page);
  d = await appDoc(page);
  check(d.artboard.width === 1200 && d.artboard.height === 630, 'double-clicking OG image creates 1200 × 630');
  await openNew(page);
  await card(page, 'Free project').click();
  await dialog(page).getByText('Custom', { exact: true }).click();
  await dialog(page).getByLabel('Custom width').fill('800');
  await dialog(page).getByLabel('Custom width').press('Tab');
  await dialog(page).getByLabel('Custom height').fill('600');
  await dialog(page).getByLabel('Custom height').press('Tab');
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await waitClosed(page);
  d = await appDoc(page);
  check(d.artboard.width === 800 && d.artboard.height === 600, `custom 800 × 600 (got ${d.artboard.width} × ${d.artboard.height})`);
  ok('Free project: default 1024 × 1024, OG image by double-click, custom 800 × 600');

  // 5. Wireframe with options, Back, Esc
  await openNew(page);
  await card(page, 'Wireframe').click();
  await dialog(page).getByRole('button', { name: 'Back' }).click();
  await dialog(page).getByRole('heading', { name: 'New document' }).waitFor();
  check((await focused()) === 'wireframe', 'Back focuses the card it came from');
  await page.keyboard.press('Escape');
  await waitClosed(page);
  await openNew(page);
  check((await dialog(page).getByRole('group', { name: 'Design mode' }).count()) === 1, 'reopening starts at step 1');
  await card(page, 'Wireframe').click();
  await dialog(page).getByText('Desktop', { exact: true }).click();
  await dialog(page).getByLabel('Name').fill('Admin');
  await dialog(page).getByLabel('Name').press('Enter');
  await waitClosed(page);
  d = await appDoc(page);
  check(d.name === 'Admin' && platforms(d).join() === 'desktop', `Wireframe desktop (got ${d.name}, ${platforms(d).join()})`);
  ok('Wireframe → Desktop, named, Enter in the name creates; Back and Esc work');

  // Open SVG… and All projects are still on step 1
  await openNew(page);
  check(await dialog(page).getByRole('button', { name: 'Open SVG…' }).isVisible(), 'Open SVG… on step 1');
  await dialog(page).getByRole('button', { name: 'All projects' }).click();
  await dialog(page).getByRole('heading', { name: /Projects/ }).waitFor();
  ok('step 1 keeps Open SVG… and All projects (opens the Projects dialog)');
  await context.close();

  // ---------- screenshots ----------
  if (shots) {
    for (const theme of ['light', 'dark'] as const)
      for (const [w, h] of [
        [1440, 900],
        [1024, 768],
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
        await dialog(p).getByRole('heading', { name: 'New document' }).waitFor();
        await p.waitForTimeout(400);
        await p.screenshot({ path: join(shots, `${theme}-${w}-modes.png`) });
        for (const [label, file] of [
          ['App icon', 'icon'],
          ['Wireframe', 'wireframe'],
          ['Free project', 'free'],
        ]) {
          await card(p, label).click();
          await p.waitForTimeout(400);
          await p.screenshot({ path: join(shots, `${theme}-${w}-${file}.png`) });
          await dialog(p).getByRole('button', { name: 'Back' }).click();
        }
        await ctx.close();
      }
    ok(`screenshots in ${shots}`);
  }
} finally {
  await browser.close();
  app.stop();
}
