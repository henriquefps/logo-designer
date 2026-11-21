// Playwright check of component kits (docs/wireframe-mode.md → Kits, import and paste), in the real app with a
// fictional "Acme kit" (scripts/demo/lib/acmeKit.ts) built by the CLI and opened from a `designer link`.
// Runs the dev server (or DEMO_URL):
//
//   node scripts/kit-import-e2e.ts                                   (Playwright's Chromium)
//   SHOTS=docs/screenshots/kit-import node scripts/kit-import-e2e.ts    also saves screenshots
//
// 1. New document → Wireframe with no kit anywhere: no "Start with components from", a hint about the toggle;
// 2. open the Acme kit and turn on Properties → Project → Use as component kit;
// 3. New document → Wireframe → "Start with components from: Acme kit" → Create: one phone screen and every kit
//    master in My components, no kit screens; the new project is not a kit;
// 4. the library: search on top, then My components, then Components; the search filters both; full names on
//    the cards;
// 5. a new blank wireframe → Library → Import from project… → Acme kit (kits first): unticking two masters that
//    Settings sheet nests keeps them coming along, and the button and the toast say the same total; importing
//    again adds nothing;
// 6. copy an instance in the kit project, paste it into another wireframe: it stays an instance and its masters
//    (nested ones too) come along, in one undo step.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { startApp } from './demo/lib/server.ts';
import { ACME_NAMES, ACME_NESTED, acmeKitLink } from './demo/lib/acmeKit.ts';

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
  wireframe?: { screens: unknown[]; symbols?: Sym[]; kit?: boolean };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = any;
const appDoc = (page: Page) => page.evaluate(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc as Doc);
const symbolsOf = (d: Doc) => d.wireframe?.symbols ?? [];
const dialog = (page: Page) => page.getByRole('dialog');
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: join(shots, name) });
};
const panelTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).first();

const app = await startApp(root, 'dev');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(app.url);

  // 1. No kits yet: the field is hidden, a hint says how to make one.
  await dialog(page).getByRole('heading', { name: 'Welcome to Designer' }).waitFor({ timeout: 30_000 });
  await dialog(page).getByRole('group', { name: 'Design mode' }).getByRole('button', { name: /^Wireframe/ }).click();
  await dialog(page).getByRole('heading', { name: 'New wireframe' }).waitFor();
  await page.getByTestId('new-wireframe-kit-hint').waitFor();
  check((await page.getByTestId('new-wireframe-kit').count()) === 0, 'no "Start with components from" without kits');
  await dialog(page).getByLabel('Name').fill('Scratch');
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await dialog(page).waitFor({ state: 'hidden' });
  ok('New document → Wireframe without kits: no kit field, a hint about Use as component kit');

  // 2. Open the Acme kit (built by the CLI, opened from a link) and mark it as a kit.
  await page.goto(acmeKitLink(root, new URL(app.url).origin));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
  await page.waitForFunction(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc.name === 'Acme kit');
  let d = await appDoc(page);
  const kitProject = d.id;
  check(symbolsOf(d).length === ACME_NAMES.length && !d.wireframe?.kit, `the Acme kit opened, not yet a kit (${symbolsOf(d).length} components)`);
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.useEditorStore.getState().setSelection([]));
  await panelTab(page, 'Properties').click();
  const toggle = page.getByTestId('use-as-kit');
  await toggle.waitFor();
  await toggle.click();
  await page.waitForFunction(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().doc.wireframe.kit === true);
  await page.getByText('New document → Wireframe can start with this project’s 6 shared components').waitFor();
  await page.waitForTimeout(300); // the switch's animation
  await shot(page, 'use-as-kit-toggle.png');
  ok('Properties (nothing selected) → Project → Use as component kit: wireframe.kit is on');

  // 3. New document from the kit project.
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.actions.runAction('file.new'));
  await dialog(page).getByRole('group', { name: 'Design mode' }).getByRole('button', { name: /^Wireframe/ }).click();
  await dialog(page).getByRole('heading', { name: 'New wireframe' }).waitFor();
  await dialog(page).getByLabel('Name').fill('From the kit');
  await page.getByTestId('new-wireframe-kit').click();
  const options = await page.getByRole('option').allTextContents();
  check(options.join(' | ') === 'None | Acme kit', `the select lists None and the kit projects (got ${options.join(' | ')})`);
  await shot(page, 'new-document-kit-select.png');
  await page.getByRole('option', { name: 'Acme kit' }).click();
  await shot(page, 'new-document-kit-chosen.png');
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await dialog(page).waitFor({ state: 'hidden' });
  d = await appDoc(page);
  check(d.name === 'From the kit' && d.wireframe?.screens.length === 1 && d.children.length === 1, `one phone screen, nothing else on the canvas (got ${d.wireframe?.screens.length} screens)`);
  check(symbolsOf(d).map((s) => s.name).sort().join() === [...ACME_NAMES].sort().join(), `every Acme master (got ${symbolsOf(d).map((s) => s.name).join(', ')})`);
  check(!d.wireframe?.kit, 'the new project is not a kit itself');
  ok(`New document → Wireframe → Start with components from Acme kit: 1 screen, ${symbolsOf(d).length} shared components`);

  // 4. The library: search, My components, Components (in that order); the search filters both; full names.
  await panelTab(page, 'Assets').click();
  const compTab = page.getByRole('tab', { name: 'Components', exact: true });
  if ((await compTab.getAttribute('data-state')) !== 'active') await compTab.click();
  await page.getByTestId('import-components').waitFor();
  const order = await page.evaluate(() => {
    const search = document.querySelector('[data-testid="library-search"]')!;
    const heads = [...document.querySelectorAll('h3')].filter((h) => /^(My components|Components)/.test(h.textContent ?? ''));
    const pos = (n: Node) => [...document.querySelectorAll('*')].indexOf(n as Element);
    return [{ name: 'Search', at: pos(search) }, ...heads.map((h) => ({ name: h.textContent!.replace(/ ·.*/, ''), at: pos(h) }))].sort((a, b) => a.at - b.at).map((x) => x.name);
  });
  check(order.join(' | ') === 'Search | My components | Components', `search, then My components, then Components (got ${order.join(' | ')})`);
  const names = page.getByTestId('symbol-name');
  const cut = await names.evaluateAll((els) => els.filter((e) => e.scrollHeight > e.clientHeight + 1 || e.getAttribute('title') !== e.textContent).map((e) => e.textContent));
  check((await names.count()) === ACME_NAMES.length && cut.length === 0, `every card shows its whole name, the tooltip too (cut: ${cut.join(', ')})`);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300); // the tabs' animation
  await shot(page, 'library-order.png');
  const search = page.getByPlaceholder('Search components…');
  await search.fill('list row');
  await page.waitForTimeout(150);
  check((await names.allTextContents()).join() === 'Acme · List row', `the search filters My components (got ${(await names.allTextContents()).join(', ')})`);
  check(await page.getByRole('heading', { name: /^Components/ }).isVisible(), 'and the library');
  await shot(page, 'library-search.png');
  await search.fill('zzz nothing');
  await page.getByText('No components match your search.').waitFor();
  check((await page.getByRole('heading', { name: 'My components' }).count()) === 0, 'My components is hidden when nothing matches');
  await search.fill('');
  ok('Library: search on top filters My components and Components; full names on the cards');

  // 5. Import from project… into a blank wireframe, with two nested masters unticked.
  await page.evaluate(async () => {
    const D = (window as unknown as { __designer: D }).__designer;
    await D.wireframe.createWireframeDocument({ name: 'Blank' });
    D.useEditorStore.getState().setPanelTab('assets');
  });
  await page.getByTestId('import-components').click();
  await dialog(page).getByRole('heading', { name: 'Import components' }).waitFor();
  await page.getByTestId('import-components-list').waitFor();
  check((await page.getByTestId('import-components-source').textContent())?.includes('Acme kit'), 'the first source is the kit');
  await page.getByTestId('import-components-source').click();
  const sources = await page.getByRole('option').allTextContents();
  check(sources.join(' | ') === 'Acme kit | From the kit', `kits first, then projects with components (got ${sources.join(' | ')})`);
  await shot(page, 'import-components-sources.png');
  await page.keyboard.press('Escape');
  const list = page.getByTestId('import-components-list');
  const boxes = list.getByRole('checkbox');
  check((await boxes.count()) === ACME_NAMES.length, `one checkbox per component (got ${await boxes.count()})`);
  check(await boxes.evaluateAll((els) => els.every((e) => (e as HTMLInputElement).checked)), 'all ticked');
  for (const name of ACME_NESTED.slice(0, 2)) await list.locator('label', { hasText: name }).getByRole('checkbox').uncheck();
  const submit = page.getByTestId('import-components-submit');
  check((await submit.textContent()) === 'Import 6 (2 come along)', `the button counts what comes along (got ${await submit.textContent()})`);
  check((await list.getByText('Comes along (used inside another)').count()) === 2, 'the unticked nested ones say they come along');
  await page.waitForTimeout(400); // previews
  await shot(page, 'import-components-dialog.png');
  await submit.click();
  await page.getByText('Imported 6 components').waitFor();
  await page.getByText('2 came along because others use them.').waitFor();
  await shot(page, 'import-components-toast.png');
  d = await appDoc(page);
  check(symbolsOf(d).length === ACME_NAMES.length, 'the blank project got every master');
  // Again: nothing new.
  await page.getByTestId('import-components').click();
  await list.waitFor();
  check((await submit.textContent()) === 'Import 6', `all ticked: no "come along" (got ${await submit.textContent()})`);
  await submit.click();
  await page.getByText('Nothing new to import').waitFor();
  check(symbolsOf(await appDoc(page)).length === ACME_NAMES.length, 'importing again adds nothing');
  ok('Library → Import from project… → Acme kit: "Import 6 (2 come along)", the toast says 6; a second import is a no-op');

  // 6. Paste between documents keeps instances.
  const pasteTarget = await page.evaluate(async (kitId) => {
    const D = (window as unknown as { __designer: D }).__designer;
    await D.wireframe.createWireframeDocument({ name: 'Paste target' });
    const target = D.useDocStore.getState().doc.id;
    await D.useProjectsStore.getState().open(kitId);
    // An instance of the master that nests others (they come along).
    const doc = D.useDocStore.getState().doc;
    const outer = doc.wireframe.symbols.find((s: Sym) => s.name === 'Acme · Settings sheet');
    D.useEditorStore.getState().setSelection([doc.children[0].id]);
    const id = D.symbols.insertSymbol(outer.id);
    D.useEditorStore.getState().setSelection([id]);
    return { target, outer: outer.name as string };
  }, kitProject);
  await page.evaluate(() => {
    const D = (window as unknown as { __designer: D }).__designer;
    D.clipboard.copyNodes(D.useEditorStore.getState().selection);
  });
  await page.evaluate(async (t) => (window as unknown as { __designer: D }).__designer.useProjectsStore.getState().open(t), pasteTarget.target);
  check(symbolsOf(await appDoc(page)).length === 0, 'the paste target starts without shared components');
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.actions.runAction('edit.paste'));
  d = await appDoc(page);
  const pasted = d.children.flatMap((c) => [c, ...((c.children ?? []) as Doc['children'])]).find((c) => c.symbol);
  const outerSym = symbolsOf(d).find((s) => s.name === pasteTarget.outer);
  check(outerSym && pasted?.symbol?.id === outerSym.id, `the pasted copy is an instance of the imported “${pasteTarget.outer}”`);
  check(symbolsOf(d).length === 1 + ACME_NESTED.length, `nested masters came along (got ${symbolsOf(d).map((s) => s.name).join(', ')})`);
  await shot(page, 'paste-across-documents.png');
  await page.evaluate(() => (window as unknown as { __designer: D }).__designer.useDocStore.getState().undo());
  check(symbolsOf(await appDoc(page)).length === 0, 'one undo removes the paste and the imported masters');
  ok(`paste into another wireframe: an instance of “${pasteTarget.outer}”, ${symbolsOf(d).length} masters imported, one undo step`);
} finally {
  await browser.close();
  app.stop();
}
