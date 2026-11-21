// Playwright check of component kits (docs/wireframe-mode.md → Kits, import and paste), in the real app with the
// bundled hfps-kit sample. Runs the dev server (or DEMO_URL):
//
//   node scripts/kit-import-e2e.ts                                   (Playwright's Chromium)
//   SHOTS=docs/screenshots/kit-import node scripts/kit-import-e2e.ts    also saves screenshots
//
// 1. New document → Wireframe → "Start with components from: hfps-kit" → Create: one phone screen and every
//    kit master in My components, no kit screens;
// 2. a new blank wireframe → Library → Import from project… → hfps-kit (kits first, all ticked) → Import: a
//    toast with the count; importing again adds nothing;
// 3. copy an instance in the kit project, paste it into another wireframe (⌘C / ⌘V): it stays an instance and
//    its masters (nested ones too) come along, in one undo step.
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

interface Sym {
  id: string;
  name: string;
}
interface Doc {
  id: string;
  name: string;
  children: { id: string; symbol?: { id: string }; children?: unknown[]; screen?: unknown }[];
  wireframe?: { screens: unknown[]; symbols?: Sym[] };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = any;
const appDoc = (page: Page) => page.evaluate(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc as Doc);
const symbolsOf = (d: Doc) => d.wireframe?.symbols ?? [];
const dialog = (page: Page) => page.getByRole('dialog');
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: join(shots, name) });
};

const app = await startApp(root, 'dev');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(app.url);

  // 1. New document from the kit
  await dialog(page).getByRole('heading', { name: 'Welcome to Designer' }).waitFor({ timeout: 30_000 });
  await dialog(page).getByRole('group', { name: 'Design mode' }).getByRole('button', { name: /^Wireframe/ }).click();
  await dialog(page).getByRole('heading', { name: 'New wireframe' }).waitFor();
  await dialog(page).getByLabel('Name').fill('From the kit');
  await page.getByTestId('new-wireframe-kit').click();
  const options = await page.getByRole('option').allTextContents();
  check(options[0] === 'None' && options.includes('hfps-kit'), `the select lists None and the kits (got ${options.join(' | ')})`);
  await shot(page, 'new-document-kit-select.png');
  await page.getByRole('option', { name: 'hfps-kit' }).click();
  await shot(page, 'new-document-kit-chosen.png');
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await dialog(page).waitFor({ state: 'hidden' });
  let d = await appDoc(page);
  const kitCount = symbolsOf(d).length;
  check(d.name === 'From the kit' && d.wireframe?.screens.length === 1 && d.children.length === 1, `one phone screen, nothing else on the canvas (got ${d.wireframe?.screens.length} screens)`);
  check(kitCount === 36 && symbolsOf(d).every((s) => s.name.startsWith('hfps · ')), `every hfps-kit master (got ${kitCount})`);
  ok(`New document → Wireframe → Start with components from hfps-kit: 1 screen, ${kitCount} shared components`);
  const kitProject = d.id;

  // 2. Import from project… into a blank wireframe
  await page.evaluate(async () => {
    const D = (window as unknown as { __designer: D }).__designer;
    await D.wireframe.createWireframeDocument({ name: 'Blank' });
    D.useEditorStore.getState().setPanelTab('assets');
  });
  await page.getByTestId('import-components').click();
  await dialog(page).getByRole('heading', { name: 'Import components' }).waitFor();
  await page.getByTestId('import-components-list').waitFor();
  check((await page.getByTestId('import-components-source').textContent())?.includes('hfps-kit'), 'the first source is the kit');
  const boxes = page.getByTestId('import-components-list').getByRole('checkbox');
  check((await boxes.count()) === kitCount, `one checkbox per component (got ${await boxes.count()})`);
  check(await boxes.evaluateAll((els) => els.every((e) => (e as HTMLInputElement).checked)), 'all ticked');
  await page.waitForTimeout(400); // previews
  await shot(page, 'import-components-dialog.png');
  await page.getByTestId('import-components-source').click();
  const sources = await page.getByRole('option').allTextContents();
  check(sources[0] === 'hfps-kit' && sources.includes('From the kit'), `kits first, then projects with components (got ${sources.join(' | ')})`);
  await shot(page, 'import-components-sources.png');
  await page.keyboard.press('Escape');
  await page.getByTestId('import-components-submit').click();
  await page.getByText(`Imported ${kitCount} components`).waitFor();
  await shot(page, 'import-components-toast.png');
  d = await appDoc(page);
  check(symbolsOf(d).length === kitCount, 'the blank project got every master');
  // Again: nothing new.
  await page.getByTestId('import-components').click();
  await page.getByTestId('import-components-list').waitFor();
  await page.getByTestId('import-components-submit').click();
  await page.getByText('Nothing new to import').waitFor();
  check(symbolsOf(await appDoc(page)).length === kitCount, 'importing again adds nothing');
  ok('Library → Import from project… → hfps-kit: all imported with a toast; a second import is a no-op');

  // 3. Paste between documents keeps instances
  const pasteTarget = await page.evaluate(async (kitId) => {
    const D = (window as unknown as { __designer: D }).__designer;
    await D.wireframe.createWireframeDocument({ name: 'Paste target' });
    const target = D.useDocStore.getState().doc.id;
    await D.useProjectsStore.getState().open(kitId);
    // An instance of a master that nests another one (the nested master comes along).
    const doc = D.useDocStore.getState().doc;
    const syms = doc.wireframe.symbols;
    const nests = (s: { content: { children: unknown[] } }) => JSON.stringify(s.content.children).includes('"symbol":{"id"');
    const outer = syms.find(nests) ?? syms[0];
    D.useEditorStore.getState().setSelection([doc.children[0].id]);
    const id = D.symbols.insertSymbol(outer.id);
    D.useEditorStore.getState().setSelection([id]);
    return { target, outer: outer.name };
  }, kitProject);
  await page.evaluate(() => {
    const D = (window as unknown as { __designer: D }).__designer;
    const sel = D.useEditorStore.getState().selection;
    D.clipboard.copyNodes(sel);
  });
  await page.evaluate(async (t) => (window as unknown as { __designer: D }).__designer.useProjectsStore.getState().open(t), pasteTarget.target);
  check(symbolsOf(await appDoc(page)).length === 0, 'the paste target starts without shared components');
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.actions.runAction('edit.paste'));
  d = await appDoc(page);
  const pasted = d.children.flatMap((c) => [c, ...((c.children ?? []) as Doc['children'])]).find((c) => c.symbol);
  const outerSym = symbolsOf(d).find((s) => s.name === pasteTarget.outer);
  check(outerSym && pasted?.symbol?.id === outerSym.id, `the pasted copy is an instance of the imported “${pasteTarget.outer}”`);
  check(symbolsOf(d).length >= 2, `nested masters came along (got ${symbolsOf(d).map((s) => s.name).join(', ')})`);
  await shot(page, 'paste-across-documents.png');
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().undo());
  check(symbolsOf(await appDoc(page)).length === 0, 'one undo removes the paste and the imported masters');
  ok(`paste into another wireframe: an instance of “${pasteTarget.outer}”, ${symbolsOf(d).length} masters imported, one undo step`);
} finally {
  await browser.close();
  app.stop();
}
