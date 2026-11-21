// Playwright check of two wireframe fixes, in the real app (docs/wireframe-mode.md → Adding screens, Shared components).
// Runs the dev server:
//
//   node scripts/dup-make-e2e.ts                                    (Playwright's Chromium)
//   SHOTS=docs/screenshots/dup-make node scripts/dup-make-e2e.ts    also saves screenshots
//
// 1. Ctrl+D on a selected screen puts the copy beside it, in free canvas space (never over another frame), in view;
// 2. Object → Make component on a single library component (a list row) wraps it in a hug stack: the instance sits
//    in the same place and size, and one undo restores the plain row.
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

const SPEC = {
  name: 'Dup make e2e',
  screens: [
    {
      name: 'Home',
      platform: 'phone',
      root: [{ 'top-app-bar': 'Home' }, { 'list-row': { title: 'Item name' }, name: 'Row' }, { button: 'Save', name: 'Action' }],
    },
    { name: 'Inbox', platform: 'phone', root: [{ 'top-app-bar': 'Inbox' }] },
  ],
};

function designer(args: string[]): string {
  const r = spawnSync('bun', ['bin/designer.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`designer ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}
function link(origin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dup-make-e2e-'));
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(SPEC, null, 2));
  designer(['wf', 'build', join(dir, 'spec.json'), '-o', join(dir, 'dm.designer.json')]);
  return designer(['link', join(dir, 'dm.designer.json'), '--origin', origin]).trim();
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
  /** Is the document rect (almost) inside the canvas viewport? */
  visible: (id: string) =>
    page.evaluate((id) => {
      const d = (window as unknown as { __designer: D }).__designer;
      const r = d.model.worldBounds(d.useDocStore.getState().doc, id) as Box;
      const ed = d.useEditorStore.getState();
      const a = ed.docToScreen({ x: r.x, y: r.y });
      const b = ed.docToScreen({ x: r.x + r.width, y: r.y + r.height });
      const c = document.querySelector('[data-slot="canvas"]')!.getBoundingClientRect();
      return a.x >= -1 && a.y >= -1 && b.x <= c.width + 1 && b.y <= c.height + 1;
    }, id),
});
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: join(shots, name) });
};

const app = await startApp(root, 'dev');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(app.url);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Welcome to Designer' }).waitFor({ timeout: 30_000 });
  await dialog
    .getByRole('group', { name: 'Design mode' })
    .getByRole('button', { name: /^Wireframe/ })
    .click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.goto(link(new URL(app.url).origin));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
  await page.waitForFunction(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc.name === 'Dup make e2e');
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.actions.runAction('view.fit'));
  await page.addStyleTag({
    content: '[data-sonner-toaster] { display: none !important; }',
  });
  await page.waitForTimeout(300);
  const t = api(page);

  // 1. Duplicate a screen.
  let d = await t.doc();
  const frames = () => (d.children as D[]).filter((c) => c.screen);
  const home = frames().find((f) => f.name === 'Home');
  await t.select([home.id]);
  await page.locator('[data-slot="canvas"]').hover();
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(500);
  d = await t.doc();
  check(frames().length === 3, 'Ctrl+D added a frame');
  const copy = frames().find((f) => f.name !== 'Home' && f.name !== 'Inbox');
  check(copy, 'the copy is a new frame');
  await shot(page, `duplicate-screen-${process.env.SHOTS_TAG ?? 'after'}.png`);
  const copyBox = (await t.bounds(copy.id))!;
  const others = (await Promise.all(frames().filter((f) => f !== copy).map((f) => t.bounds(f.id)))) as Box[];
  expectThat(!others.some((o) => overlap(o, copyBox)), 'the copy does not overlap any other screen');
  const homeBox = (await t.bounds(home.id))!;
  expectThat(copyBox.x >= homeBox.x + homeBox.width + 20 && Math.abs(copyBox.y - homeBox.y) < 1, 'the copy sits to the right of the original, same top');
  expectThat(await t.visible(copy.id), 'the copy is in view');
  ok('Ctrl+D on a screen places the copy beside it, in view');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  d = await t.doc();
  check(frames().length === 2, 'undo removes the copy');

  // 2. Make component on one library component: an edge-to-edge row and a hugging button.
  for (const name of ['Row', 'Action']) {
    const row = home.children.find((c: D) => c.name === name);
    check(row, `the Home screen has a ${name}`);
    await t.select([row.id]);
    const before = (await t.bounds(row.id))!;
    await shot(page, `make-component-${process.env.SHOTS_TAG ?? 'after'}-${name}-1-selected.png`);
    await page.locator('[data-slot="canvas"]').hover();
    await page.keyboard.press('Alt+Shift+K');
    const named = page.getByRole('dialog');
    const opened = await named
      .getByRole('heading', { name: 'Make component' })
      .waitFor({ timeout: 2500 })
      .then(
        () => true,
        () => false,
      );
    expectThat(opened, 'Make component opens for a single library component');
    if (opened) {
      await named.getByLabel(/name/i).fill(`${name} component`);
      await named.getByRole('button', { name: 'Make component' }).click();
      await page.waitForTimeout(500);
      d = await t.doc();
      const homeNow = frames().find((f) => f.name === 'Home');
      const inst = homeNow.children.find((c: D) => c.symbol);
      check(inst, 'Home has a shared component instance');
      check(inst.layout?.kind === 'vstack' && inst.children.length === 1, 'the instance is a stack around the row');
      const after = (await t.bounds(inst.id))!;
      // ±3 px: a hugging button is measured again inside the stack (the CLI wrote an approximate width).
      const close = (a: number, b: number) => Math.abs(a - b) <= 3;
      check(
        close(after.x, before.x) && close(after.y, before.y) && close(after.width, before.width) && close(after.height, before.height),
        `same place and size (${JSON.stringify(before)} → ${JSON.stringify(after)})`,
      );
      await shot(page, `make-component-${process.env.SHOTS_TAG ?? 'after'}-${name}-2-made.png`);
      ok(`Make component wraps a single ${name} in a hug stack`);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
      d = await t.doc();
      check(
        !frames()
          .find((f) => f.name === 'Home')
          .children.some((c: D) => c.symbol) && !d.wireframe.symbols?.length,
        'one undo restores the plain row',
      );
      ok('one undo step');
    } else {
      await shot(page, `make-component-${process.env.SHOTS_TAG ?? 'after'}-${name}-2-made.png`);
    }
  }
  console.log('\ndup-make e2e: done');
} finally {
  await browser.close();
  app.stop();
}
