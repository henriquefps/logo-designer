// Playwright check of per-instance content in shared components (docs/wireframe-mode.md → Shared components →
// Slots and text overrides), in the real app. A project with an "App shell" (top bar + a card that is a slot) and an
// "Acme · List row" on two screens is built by the CLI and opened from a `designer link`. Runs the dev server:
//
//   node scripts/slots-e2e.ts                                       (Playwright's Chromium)
//   SHOTS=docs/screenshots/slots node scripts/slots-e2e.ts          also saves screenshots
//
// 1. drag a list row from the library into Home's slot (the insertion line shows inside the card), and a button into
//    Inbox's: each screen keeps its own content, the master's slot stays empty;
// 2. a drop on the shell's top bar lands on the screen next to the shell, never inside it;
// 3. edit the master's top bar (its title, then "Use everywhere"): both shells update and keep their content;
// 4. override a list row's text on Home: Inbox keeps the master's, Properties says "Overridden here", Reset works;
// 5. Layers follows the canvas: a click on the canvas opens the collapsed screen and scrolls to the selected row.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
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

const SPEC = {
  name: 'Slots e2e',
  components: [
    {
      name: 'App shell',
      content: { vstack: [{ 'top-app-bar': 'Acme', name: 'Top bar' }, { vstack: [], name: 'Body', slot: true, style: 'outline', radius: 'small', padding: 16, gap: 8 }], gap: 8 },
    },
    { name: 'Acme · List row', content: { vstack: [{ 'list-row': { title: 'Item name' }, name: 'Row' }] } },
  ],
  screens: [
    { name: 'Home', platform: 'phone', root: [{ use: 'App shell' }, { use: 'Acme · List row' }] },
    { name: 'Inbox', platform: 'phone', root: [{ use: 'App shell' }, { use: 'Acme · List row' }] },
  ],
};

function designer(args: string[]): string {
  const r = spawnSync('bun', ['bin/designer.ts', ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`designer ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}
function link(origin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'slots-e2e-'));
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(SPEC, null, 2));
  designer(['wf', 'build', join(dir, 'spec.json'), '-o', join(dir, 'slots.designer.json')]);
  return designer(['link', join(dir, 'slots.designer.json'), '--origin', origin]).trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = any;
interface N {
  id: string;
  name: string;
  children?: N[];
  symbol?: { id: string; text?: Record<string, Record<string, string>> };
  component?: { kind: string; props: Record<string, unknown> };
  layout?: { slot?: boolean };
  screen?: unknown;
}
interface Doc {
  children: N[];
  wireframe: { symbols: { id: string; name: string; content: N }[] };
}
const appDoc = (page: Page) => page.evaluate(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc as Doc);
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: join(shots, name) });
};
const frame = (d: Doc, name: string) => d.children.find((c) => c.screen && c.name === name)!;
const shellOf = (d: Doc, screen: string) => frame(d, screen).children!.find((c) => c.name === 'App shell')!;
const bodyOf = (d: Doc, screen: string) => shellOf(d, screen).children!.find((c) => c.layout?.slot)!;
const topOf = (d: Doc, screen: string) => shellOf(d, screen).children!.find((c) => c.component?.kind === 'top-app-bar')!;
const rowInstOf = (d: Doc, screen: string) => frame(d, screen).children!.find((c) => c.name === 'Acme · List row')!;
const rowOf = (d: Doc, screen: string) => rowInstOf(d, screen).children![0];
const kinds = (n: N) => (n.children ?? []).map((c) => c.component?.kind ?? c.name);

/** Viewport point of a document node's centre (or a point inside it: fx / fy of its box). */
async function pointOf(page: Page, id: string, fx = 0.5, fy = 0.5) {
  return page.evaluate(
    ({ id, fx, fy }) => {
      const d = (window as unknown as { __designer: D }).__designer;
      const r = d.model.worldBounds(d.useDocStore.getState().doc, id);
      const ed = d.useEditorStore.getState();
      const p = ed.docToScreen({ x: r.x + r.width * fx, y: r.y + r.height * fy });
      const c = document.querySelector('[data-slot="canvas"]')!.getBoundingClientRect();
      return { x: c.left + p.x, y: c.top + p.y };
    },
    { id, fx, fy },
  );
}

/** Drags a library card (by its "Insert …" title) to a viewport point, with the native drag the app listens to. */
async function dragFromLibrary(page: Page, label: string, to: { x: number; y: number }, shotName?: string) {
  const card = page.locator(`[title^="Insert ${label} (or drag"]`).first();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x - 40, to.y - 20, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.waitForTimeout(150);
  if (shotName) await shot(page, shotName);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

const app = await startApp(root, 'dev');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(app.url);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Welcome to Designer' }).waitFor({ timeout: 30_000 });
  await dialog.getByRole('group', { name: 'Design mode' }).getByRole('button', { name: /^Wireframe/ }).click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.goto(link(new URL(app.url).origin));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
  await page.waitForFunction(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc.name === 'Slots e2e');
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.actions.runAction('view.fit'));
  // Toasts (the import's) would cover the panels in the screenshots.
  await page.addStyleTag({ content: '[data-sonner-toaster] { display: none !important; }' });
  await page.waitForTimeout(300);
  let d = await appDoc(page);
  check(bodyOf(d, 'Home') && bodyOf(d, 'Inbox') && !bodyOf(d, 'Home').children?.length, 'two App shells with an empty slot');

  // 1. Drag library components into each slot.
  await page.getByRole('tab', { name: 'Assets', exact: true }).first().click();
  const compTab = page.getByRole('tab', { name: 'Components', exact: true });
  if ((await compTab.getAttribute('data-state')) !== 'active') await compTab.click();
  await page.getByPlaceholder('Search components…').waitFor();
  await page.getByText('Drop elements here').first().waitFor();
  await dragFromLibrary(page, 'list row', await pointOf(page, bodyOf(d, 'Home').id), 'drop-into-slot.png');
  await dragFromLibrary(page, 'button', await pointOf(page, bodyOf(d, 'Inbox').id));
  d = await appDoc(page);
  check(kinds(bodyOf(d, 'Home')).join() === 'list-row', `Home's slot holds the list row (got ${kinds(bodyOf(d, 'Home')).join()})`);
  check(kinds(bodyOf(d, 'Inbox')).join() === 'button', `Inbox's slot holds the button (got ${kinds(bodyOf(d, 'Inbox')).join()})`);
  const shellMaster = d.wireframe.symbols.find((s) => s.name === 'App shell')!;
  check(!(shellMaster.content.children![1].children ?? []).length, 'the master’s slot stays empty');
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().setSelection([]));
  await page.waitForTimeout(100);
  await shot(page, 'slots-two-screens.png');
  ok('library drags land in each screen’s slot; each keeps its own content');

  // 2. A drop on the top bar goes next to the shell, never into its shared part.
  await dragFromLibrary(page, 'heading', await pointOf(page, topOf(d, 'Home').id, 0.5, 0.2));
  d = await appDoc(page);
  check(kinds(bodyOf(d, 'Home')).join() === 'list-row' && kinds(topOf(d, 'Home')).length >= 0, 'the slot is unchanged');
  check(frame(d, 'Home').children!.some((c) => c.component?.kind === 'heading'), 'the heading landed on the screen');
  check(d.wireframe.symbols.find((s) => s.name === 'App shell')!.content.children!.length === 2, 'the master did not change');
  ok('a drop on the shared part of the shell lands on the screen, not in the master');

  // 3. Edit the master's top bar: its title on Home, then "Use everywhere".
  await page.getByRole('tab', { name: 'Properties', exact: true }).first().click();
  await page.evaluate((id) => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().setSelection([id]), topOf(d, 'Home').id);
  const title = page.getByLabel('Title', { exact: true });
  await title.fill('Acme Mail');
  await title.press('Enter');
  await page.getByTestId('override-title').waitFor();
  d = await appDoc(page);
  check(topOf(d, 'Home').component!.props.title === 'Acme Mail' && topOf(d, 'Inbox').component!.props.title === 'Acme', 'typed text stays on Home until it is shared');
  await page.getByTestId('override-title').getByRole('button', { name: 'Use everywhere' }).click();
  await page.waitForFunction(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc.wireframe.symbols[0].content.children[0].component.props.title === 'Acme Mail');
  d = await appDoc(page);
  check(topOf(d, 'Inbox').component!.props.title === 'Acme Mail', 'Inbox’s top bar follows the master');
  check(kinds(bodyOf(d, 'Home')).join() === 'list-row' && kinds(bodyOf(d, 'Inbox')).join() === 'button', 'both slots keep their content');
  ok('the master’s top bar changed on both screens; the slots kept their content');

  // 4. Override a list row's text on Home.
  await page.evaluate((id) => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().setSelection([id]), rowOf(d, 'Home').id);
  const rowTitle = page.getByLabel('Title', { exact: true });
  await rowTitle.fill('Inbox · 3 new');
  await rowTitle.press('Enter');
  await page.getByTestId('override-title').waitFor();
  await page.waitForTimeout(150);
  await shot(page, 'text-override.png');
  d = await appDoc(page);
  check(rowOf(d, 'Home').component!.props.title === 'Inbox · 3 new', 'Home’s row shows its own text');
  check(rowOf(d, 'Inbox').component!.props.title === 'Item name', 'Inbox’s row keeps the master’s');
  check(d.wireframe.symbols.find((s) => s.name === 'Acme · List row')!.content.children![0].component!.props.title === 'Item name', 'the master is unchanged');
  check(!!rowInstOf(d, 'Home').symbol?.text, 'the override is stored on the instance');
  await page.getByTestId('override-title').getByRole('button', { name: 'Reset to shared' }).click();
  await page.getByTestId('override-title').waitFor({ state: 'detached' });
  d = await appDoc(page);
  check(rowOf(d, 'Home').component!.props.title === 'Item name', 'Reset to shared shows the master’s text');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForFunction(() => {
    const doc = (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc;
    const home = doc.children.find((c: N) => c.screen && c.name === 'Home');
    return home.children.find((c: N) => c.name === 'Acme · List row').children[0].component.props.title === 'Inbox · 3 new';
  });
  ok('a list row’s text overridden on one screen; Reset to shared and undo work');

  // 5. Layers follows the canvas: a short window, so the list scrolls.
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().setSelection([]));
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.actions.runAction('view.fit'));
  await page.getByRole('tab', { name: 'Layers', exact: true }).first().click();
  const tree = page.getByRole('tree', { name: 'Layers' });
  await tree.waitFor();
  const scrollerOf = (id: string) =>
    page.evaluate((id) => {
      let s = document.querySelector(`[data-layer-id="${id}"]`)?.parentElement ?? null;
      while (s && !(s.scrollHeight > s.clientHeight && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      return !!s;
    }, id);
  const homeId = frame(d, 'Home').id;
  const homeRow = tree.locator(`[data-layer-id="${homeId}"]`);
  await homeRow.scrollIntoViewIfNeeded();
  if ((await homeRow.getAttribute('aria-expanded')) === 'true') await homeRow.getByRole('button', { name: 'Collapse' }).click();
  check(await scrollerOf(homeId), 'the Layers list scrolls in a short window');
  await page.evaluate((id) => {
    let s = document.querySelector(`[data-layer-id="${id}"]`)?.parentElement ?? null;
    while (s && !(s.scrollHeight > s.clientHeight && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    if (s) s.scrollTop = 0;
  }, homeId);
  const target = rowInstOf(d, 'Home').id;
  check((await tree.locator(`[data-layer-id="${target}"]`).count()) === 0, 'Home’s rows are hidden (its screen collapsed)');
  // A click on the canvas selects Home's list row.
  const p = await pointOf(page, target);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction((id) => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().selection.includes(id), target);
  const row = tree.locator(`[data-layer-id="${target}"]`);
  await row.waitFor();
  await page.waitForTimeout(200);
  const where = await row.evaluate((el) => {
    const r = el.getBoundingClientRect();
    let s: HTMLElement | null = el.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    const box = (s ?? document.documentElement).getBoundingClientRect();
    return { visible: r.top >= box.top - 1 && r.bottom <= box.bottom + 1, scrollTop: s?.scrollTop ?? 0 };
  });
  check(where.visible && where.scrollTop > 0, `the selected row is scrolled into view (scrollTop ${where.scrollTop})`);
  check((await row.getAttribute('aria-selected')) === 'true', 'and selected');
  await shot(page, 'layers-follow-canvas.png');
  // No jump when the panel itself selects: a click on a row that is already visible.
  const before = where.scrollTop;
  // (another row that is fully visible, clicked with the mouse where it is, so Playwright does not scroll)
  const pick = await tree.evaluate((t, skip) => {
    let s: HTMLElement | null = t.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    const box = s!.getBoundingClientRect();
    const rows = [...t.querySelectorAll('[data-layer-id]')].filter((r) => r.getAttribute('data-layer-id') !== skip);
    const hit = rows.map((r) => ({ id: r.getAttribute('data-layer-id')!, r: r.getBoundingClientRect() })).find((x) => x.r.top >= box.top && x.r.bottom <= box.bottom);
    return hit ? { id: hit.id, x: hit.r.left + 60, y: hit.r.top + hit.r.height / 2 } : null;
  }, target);
  check(pick, 'another visible row');
  const other = tree.locator(`[data-layer-id="${pick.id}"]`);
  await page.mouse.click(pick.x, pick.y);
  await page.waitForFunction((id) => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().selection.includes(id), pick.id);
  const after = await other.evaluate((el) => {
    let s: HTMLElement | null = el.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    return s?.scrollTop ?? 0;
  });
  check(before === after, `a click in Layers does not scroll it (${before} → ${after})`);
  ok('Layers opens the collapsed screen and scrolls to a canvas selection');

  console.log('\nslots e2e: all checks passed');
} finally {
  await browser.close();
  app.stop();
}
