// Playwright check of the align buttons inside stacks, justify, and Layers following a deep canvas selection
// (docs/wireframe-mode.md → Aligning in a stack). Runs the dev server on a neutral fixture (a tablet screen with a
// title, a row of three buttons and two cards that each hold a centred stack):
//
//   node scripts/align-stacks-e2e.ts                                  (Playwright's Chromium)
//   SHOTS=docs/screenshots/align-stacks node scripts/align-stacks-e2e.ts    also saves screenshots
//
// 1. Align → centre on a fill-width heading sets its own alignment (it used to do nothing: the stack put it back);
// 2. centre on the row of buttons (the row, or one button) centres the buttons through the row's justify;
// 3. centre on the two card labels centres them; every click is one undo step;
// 4. where nothing applies (a grid cell) a toast says why;
// 5. Layers: a selection made while the tab was closed is revealed and clearly highlighted when it opens, and a deep
//    selection made while it is open opens the collapsed screen and scrolls to the row.
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
// The shot is saved before the check, so a run against the old behaviour still leaves its "before" picture.
const soft = process.env.SOFT === '1';
function expectThat(cond: unknown, what: string) {
  if (cond) return;
  if (soft) console.log(`NOT OK  ${what}`);
  else check(cond, what);
}

const card = (name: string, label: string) => ({
  vstack: [{ avatar: {}, name: `${name} icon` }, { heading: label, name: `${name} label` }],
  name,
  align: 'center',
  style: 'outline',
  radius: 'small',
  padding: 12,
  width: 'fill',
});
const SPEC = {
  name: 'Align stacks e2e',
  screens: [
    ...['Welcome', 'Garden', 'Orchard', 'Meadow', 'Harbour', 'Lagoon'].map((name) => ({ name, platform: 'phone', root: [{ 'top-app-bar': name }, { text: 'Placeholder' }] })),
    {
      name: 'Flower cards',
      variants: [
        { platform: 'phone', root: [{ 'top-app-bar': 'Flowers' }] },
        {
          platform: 'tablet',
          root: [
            { 'top-app-bar': 'Flowers' },
            { grid: [{ image: {} }, { image: {} }, { image: {} }], columns: 3, name: 'Photos' },
            { heading: 'Pick a flower', name: 'Page title' },
            { hstack: [{ button: 'Back' }, { button: 'Play' }, { button: 'Next' }], name: 'Button row' },
            { hstack: [card('Card A', 'Roses'), card('Card B', 'Tulips')], name: 'Cards' },
          ],
        },
      ],
    },
  ],
};

function designer(args: string[]): string {
  const r = spawnSync('bun', ['bin/designer.ts', ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`designer ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}
function link(origin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'align-stacks-e2e-'));
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(SPEC, null, 2));
  designer(['wf', 'build', join(dir, 'spec.json'), '-o', join(dir, 'as.designer.json')]);
  return designer(['link', join(dir, 'as.designer.json'), '--origin', origin]).trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = any;
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const api = (page: Page) => ({
  doc: () => page.evaluate(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc as D),
  select: (ids: string[]) => page.evaluate((ids) => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().setSelection(ids), ids),
  bounds: (id: string) =>
    page.evaluate((id) => {
      const d = (window as unknown as { __designer: D }).__designer;
      return d.model.worldBounds(d.useDocStore.getState().doc, id) as Box | null;
    }, id),
  /** Zooms the canvas onto a node (centred, with a margin). */
  zoomTo: (id: string) =>
    page.evaluate((id) => {
      const d = (window as unknown as { __designer: D }).__designer;
      const r = d.model.worldBounds(d.useDocStore.getState().doc, id) as Box;
      const ed = d.useEditorStore.getState();
      const c = document.querySelector('[data-slot="canvas"]')!.getBoundingClientRect();
      const zoom = Math.min((c.width - 80) / r.width, (c.height - 80) / r.height);
      ed.setZoom(zoom);
      const a = d.useEditorStore.getState().docToScreen({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const cur = d.useEditorStore.getState().pan;
      ed.setPan({ x: cur.x + c.width / 2 - a.x, y: cur.y + c.height / 2 - a.y });
    }, id),
});
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: join(shots, name) });
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const find = (n: any, name: string): any => {
  if (n.name === name) return n;
  if (n.component) return null;
  for (const c of n.children ?? []) {
    const f = find(c, name);
    if (f) return f;
  }
  return null;
};

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
  await page.waitForFunction(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc.name === 'Align stacks e2e');
  const t = api(page);
  const undo = async () => {
    await page.locator('[data-slot="canvas"]').hover();
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(150);
  };

  const d = await t.doc();
  const tablet = d.children.find((c: D) => c.screen && c.name === 'Flower cards' && c.screen.platform === 'tablet');
  check(tablet, 'the tablet variant exists');
  const ids = {
    title: find(tablet, 'Page title').id,
    row: find(tablet, 'Button row').id,
    play: find(tablet, 'Button row').children[1].id,
    cards: find(tablet, 'Cards').id,
    labelA: find(tablet, 'Card A label').id,
    labelB: find(tablet, 'Card B label').id,
    iconA: find(tablet, 'Card A icon').id,
    photo: find(tablet, 'Photos').children[0].id,
  };
  await t.zoomTo(tablet.id);
  await page.waitForTimeout(300);
  await shot(page, 'before.png');

  const props = page.getByRole('tab', { name: 'Properties', exact: true }).first();
  await props.click();
  const alignBtn = (label: string) => page.getByRole('button', { name: label, exact: true }).last();
  const centre = async () => {
    await alignBtn('Align horizontal centers').click();
    await page.waitForTimeout(250);
  };
  const byId = async (id: string) => {
    const w = (n: D): D => (n.id === id ? n : (n.children ?? []).map(w).find(Boolean));
    return w({ children: (await t.doc()).children });
  };
  const centred = async (outer: Box, inner: Box) => Math.abs(inner.x + inner.width / 2 - (outer.x + outer.width / 2)) < 1.5;

  // 1. A fill-width heading.
  await t.select([ids.title]);
  let title = (await byId(ids.title)) as D;
  check(title.component.props.align === 'left', 'the heading starts left aligned');
  const titleBox = (await t.bounds(ids.title))!;
  await centre();
  title = await byId(ids.title);
  check(title.component.props.align === 'center', 'Align centre on a fill-width heading centres its text');
  check((await t.bounds(ids.title))!.width === titleBox.width, 'the heading keeps its width (it fills)');
  await undo();
  check((await byId(ids.title)).component.props.align === 'left', 'one undo step restores it');
  await centre();
  ok('centre on a fill-width heading sets its own align (one undo step)');

  // 2. The row of three buttons: select the row, then one button.
  const tabletBox = (await t.bounds(tablet.id))!;
  const spans = async () => {
    const kids = (await byId(ids.row)).children as D[];
    const first = (await t.bounds(kids[0].id))!;
    const last = (await t.bounds(kids[2].id))!;
    return { left: first.x, right: last.x + last.width };
  };
  let s = await spans();
  const rowBox = (await t.bounds(ids.row))!;
  check(Math.abs(s.left - rowBox.x) < 1.5, 'the buttons start at the left of the row');
  await t.select([ids.row]);
  await centre();
  check((await byId(ids.row)).layout.justify === 'center', 'the row got justify: center');
  s = await spans();
  expectThat(Math.abs(s.left - rowBox.x - (rowBox.x + rowBox.width - s.right)) < 1.5, 'the three buttons sit in the middle of the row');
  expectThat(await centred(tabletBox, { x: s.left, width: s.right - s.left, y: 0, height: 0 }), 'and in the middle of the screen');
  await undo();
  check((await byId(ids.row)).layout.justify === undefined, 'one undo step restores the row');
  await t.select([ids.play]);
  await alignBtn('Align right').click();
  await page.waitForTimeout(250);
  check((await byId(ids.row)).layout.justify === 'end', 'right on one button of the row sets the row’s justify: end');
  s = await spans();
  expectThat(Math.abs(rowBox.x + rowBox.width - s.right) < 1.5, 'the buttons sit at the right end');
  await undo();
  await t.select([ids.row]);
  await centre();
  ok('centre on the button row (selected, or one of its buttons) places the buttons');

  // 3. Card labels (fill-width headings in a centred stack).
  await t.select([ids.labelA, ids.labelB]);
  await centre();
  check((await byId(ids.labelA)).component.props.align === 'center' && (await byId(ids.labelB)).component.props.align === 'center', 'both card labels are centred');
  await undo();
  check((await byId(ids.labelA)).component.props.align === 'left' && (await byId(ids.labelB)).component.props.align === 'left', 'one undo step restores both');
  await centre();
  ok('centre on the card labels sets their align (one undo step)');
  await t.select([]);
  await page.waitForTimeout(200);
  await shot(page, 'after.png');

  // 4. Nothing applies: a toast says why.
  await t.select([ids.photo]);
  await alignBtn('Align top').click();
  await page.getByText('Placed by the grid').first().waitFor({ timeout: 3000 });
  await shot(page, 'toast.png');
  ok('a grid cell says it is placed by the grid');

  // 5. Layers. A short window so the list scrolls; the selection is made with the tab closed.
  await page.setViewportSize({ width: 1280, height: 560 });
  await t.select([ids.labelB]);
  await page.getByRole('tab', { name: 'Layers', exact: true }).first().click();
  const tree = page.getByRole('tree', { name: 'Layers' });
  await tree.waitFor();
  const rowOf = (id: string) => tree.locator(`[data-layer-id="${id}"]`);
  const inView = (id: string) =>
    rowOf(id).evaluate((el) => {
      const r = el.getBoundingClientRect();
      let s: HTMLElement | null = el.parentElement;
      while (s && !(s.scrollHeight > s.clientHeight && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      const box = (s ?? document.documentElement).getBoundingClientRect();
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    });
  await rowOf(ids.labelB).waitFor();
  await page.waitForTimeout(250);
  check(await inView(ids.labelB), 'the selection made while Layers was closed is in view when it opens');
  check((await rowOf(ids.labelB).getAttribute('aria-selected')) === 'true', 'and selected');
  // Clearly highlighted: not the faint grey of a hovered row, and an accent bar on the left.
  const look = await rowOf(ids.labelB).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, shadow: cs.boxShadow };
  });
  const other = await rowOf(ids.labelA).evaluate((el) => getComputedStyle(el).backgroundColor);
  check(look.bg !== other && look.shadow !== 'none', `the selected row is clearly highlighted (${look.bg}, ${look.shadow})`);
  await shot(page, 'layers-selected.png');
  // While the tab is open: collapse the screen, select a deeper node on the canvas, the row comes back.
  await t.select([]);
  const frameRow = rowOf(tablet.id);
  if ((await frameRow.getAttribute('aria-expanded')) === 'true') await frameRow.getByRole('button', { name: 'Collapse' }).click();
  check((await rowOf(ids.labelA).count()) === 0, 'the tablet screen is collapsed in Layers');
  await t.select([ids.iconA]);
  await rowOf(ids.iconA).waitFor();
  await page.waitForTimeout(250);
  check(await inView(ids.iconA), 'a deep selection opens the collapsed screen and scrolls to its row');
  check((await rowOf(ids.iconA).getAttribute('aria-selected')) === 'true', 'and selects it');
  ok('Layers reveals deep selections, opened or not, and highlights the row');

  console.log('\nalign stacks e2e: all checks passed');
} finally {
  await browser.close();
  app.stop();
}
