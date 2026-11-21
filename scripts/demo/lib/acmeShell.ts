// Shared components the slots / text-override scenarios make through the UI (fast, in a setup that is cut from the
// video): a fictional "Acme · App shell" (top bar + a card container) and "Acme · List row".
import type { Page } from 'playwright';
import type { Demo } from './demo.ts';
import { insertFromLibrary, openTab } from './designer.ts';

type N = { id: string; name: string; type?: string; symbol?: { id: string }; screen?: { screenId: string }; layout?: { slot?: boolean }; component?: { kind: string; props: Record<string, unknown> }; children?: N[] };
type Doc = { children: N[] };
type W = { __designer: { useDocStore: { getState(): { doc: Doc } } } };

/** The open document (read only: scenarios find nodes by what they are, never change the stores). */
export const readDoc = (page: Page) => page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc);

/** Depth-first search of a screen's nodes: the first (nth) that `pred` accepts. */
export async function findNode(page: Page, screen: string, pred: { kind?: string; name?: string; slot?: boolean; text?: string; nth?: number }): Promise<string> {
  const id = await page.evaluate(
    ([sc, p]) => {
      const d = (window as unknown as W).__designer.useDocStore.getState().doc;
      const frame = d.children.find((c) => c.screen && c.name === sc);
      const hits: string[] = [];
      const walk = (n: N) => {
        if ((!p.kind || n.component?.kind === p.kind) && (!p.name || n.name === p.name) && (!p.slot || n.layout?.slot) && (!p.text || JSON.stringify(n.component?.props ?? {}).includes(p.text))) hits.push(n.id);
        for (const c of n.children ?? []) walk(c);
      };
      for (const c of frame?.children ?? []) walk(c);
      return hits[p.nth ?? 0] ?? null;
    },
    [screen, pred] as const,
  );
  if (!id) throw new Error(`no ${JSON.stringify(pred)} on “${screen}”`);
  return id;
}

/** The Layers row of a node (open the Layers tab first). */
export const layerRow = (page: Page, id: string) => page.getByRole('tree', { name: 'Layers' }).locator(`[data-layer-id="${id}"]`);

/** File → New → Wireframe → Create (the first phone screen, "Screen 1"). */
export async function startPhoneProject(demo: Demo): Promise<void> {
  const { page } = demo;
  const dlg = page.getByRole('dialog');
  const card = dlg.getByText('Wireframe', { exact: true }).last();
  await card.waitFor({ timeout: 20_000 });
  await demo.click(card);
  await demo.click(dlg.getByRole('button', { name: 'Create' }));
  await dlg.waitFor({ state: 'hidden' });
}

/** Names the open "Make component" prompt and confirms it. */
export async function nameComponent(demo: Demo, name: string): Promise<void> {
  const dlg = demo.page.getByRole('dialog');
  await dlg.getByRole('heading', { name: 'Make component' }).waitFor();
  await demo.fill(dlg.getByLabel('Name'), name, { enter: false });
  await demo.click(dlg.getByRole('button', { name: 'Make component' }));
  await dlg.waitFor({ state: 'hidden' });
}

/** Click-inserts an empty container from the library's Layout presets ("an empty vertical stack"). */
export async function insertEmpty(demo: Demo, what: string): Promise<void> {
  await openTab(demo, 'Assets');
  const box = demo.page.getByPlaceholder('Search components…');
  if (await box.isVisible().catch(() => false)) {
    await box.fill('');
  }
  await demo.click(demo.page.locator(`[title^="Insert ${what}"]`).first(), {}, { pause: 250 });
}

/**
 * Screen 1 gets a vertical stack with a top app bar and a card container, made a shared component called
 * `name` (Object → Make component…). The card is not a slot yet.
 */
export async function makeAppShell(demo: Demo, name = 'Acme · App shell'): Promise<void> {
  const { page } = demo;
  await insertEmpty(demo, 'an empty vertical stack');
  await insertFromLibrary(demo, 'Top app bar');
  await insertEmpty(demo, 'an empty card container');
  await openTab(demo, 'Layers');
  const stack = await findNode(page, 'Screen 1', { name: 'Vertical stack' });
  await demo.click(layerRow(page, stack), { fx: 0.4 });
  await demo.menu('Object', 'Make component');
  await nameComponent(demo, name);
}
