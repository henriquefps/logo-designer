// Designer-specific helpers for scenarios: where things are in the UI and how a person reaches
// them. Locating uses the DOM (labels, roles, rendered SVG text); acting always goes through Demo
// (real pointer and keyboard input).
import type { Locator, Page } from 'playwright';
import type { Aim, Demo, Point } from './demo.ts';

export const canvas = (page: Page) => page.locator('[data-slot="canvas"]');

/** Text drawn on the canvas (component labels are real SVG text). */
export const canvasText = (page: Page, text: string | RegExp) =>
  canvas(page).locator('text').filter({ hasText: text });

/** A screen frame's name label above it ("Screen 2"). */
export const screenLabel = (page: Page, name: string) =>
  canvas(page).locator('[data-slot="screen-labels"] tspan').filter({ hasText: new RegExp(`^${name}$`) }).first();

/** The rendered node with this id (ids are read from the DOM, e.g. a parent of some text). */
export const node = (page: Page, id: string) => canvas(page).locator(`[data-node-id="${id}"]`).first();

/** The canvas node (component instance, container…) that draws `text`: the outermost `data-node-id` under the screen frame. */
export async function nodeWithText(page: Page, text: string, depth = 0): Promise<Locator> {
  const t = canvasText(page, text).first();
  const ids = await t.evaluate((el) => {
    const out: string[] = [];
    for (let p: Element | null = el; p; p = p.parentElement) {
      const id = p.getAttribute('data-node-id');
      if (id) out.push(id);
    }
    return out;
  });
  // ids: innermost first … the screen frame last. `depth` 0 = the frame's direct child.
  const id = ids[Math.max(0, ids.length - 2 - depth)];
  if (!id) throw new Error(`No node draws "${text}"`);
  return node(page, id);
}

/** The frame of a screen, from its label: the box below the label. */
export async function screenBox(page: Page, name: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const label = screenLabel(page, name);
  // The top-level node whose box starts just under the label.
  const lb = await label.boundingBox();
  if (!lb) throw new Error(`No screen "${name}"`);
  const frames = await canvas(page).locator('[data-node-id]').evaluateAll((els, l) =>
    els
      .map((e) => ({ r: e.getBoundingClientRect(), top: e.parentElement?.closest('[data-node-id]') == null }))
      .filter((f) => f.top && Math.abs(f.r.left - l.x) < 3 && f.r.top > l.y && f.r.top - l.y < 40)
      .map((f) => ({ x: f.r.left, y: f.r.top, width: f.r.width, height: f.r.height })), lb);
  if (!frames[0]) throw new Error(`No frame under "${name}"`);
  return frames[0];
}

/** A point inside a screen frame, as fractions of its box. */
export async function inScreen(page: Page, name: string, fx: number, fy: number): Promise<Point> {
  const b = await screenBox(page, name);
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

/** Welcome dialog (first visit) or File → New → Wireframe. */
export async function newWireframe(demo: Demo): Promise<void> {
  const card = demo.page.getByRole('dialog').getByText('Wireframe', { exact: true }).last();
  const welcome = await card.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false);
  if (welcome) return demo.click(card);
  await demo.menu('File', 'New');
  await demo.click(demo.page.getByRole('dialog').getByText('Wireframe', { exact: true }).last());
}

export const panelTab = (page: Page, name: 'Properties' | 'Layers' | 'Assets') => page.getByRole('tab', { name, exact: true });
export const panel = (page: Page) => page.getByRole('tabpanel').filter({ visible: true }).first();

export async function openTab(demo: Demo, name: 'Properties' | 'Layers' | 'Assets'): Promise<void> {
  const tab = panelTab(demo.page, name);
  if ((await tab.getAttribute('data-state')) !== 'active') await demo.click(tab, {}, { pause: 400 });
}

/** Assets → Components, with the search box set to `query` (typed). */
export async function searchLibrary(demo: Demo, query: string): Promise<void> {
  await openTab(demo, 'Assets');
  const sub = demo.page.getByRole('tab', { name: 'Components', exact: true });
  if ((await sub.getAttribute('data-state')) !== 'active') await demo.click(sub, {}, { pause: 400 });
  const box = demo.page.getByPlaceholder('Search components…');
  await demo.click(box, {}, { pause: 200 });
  await demo.page.keyboard.press('ControlOrMeta+A');
  await demo.page.keyboard.press('Backspace');
  await demo.type(query, { delay: 55 });
}

/** A library item in the Assets panel: its accessible name is the preview's text followed by the label. */
export const libraryItem = (page: Page, label: string) =>
  panel(page)
    .getByRole('button', { name: new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
    .filter({ visible: true })
    .first();

/** Search the library and click the item (inserts into the selected screen / stack). */
export async function insertFromLibrary(demo: Demo, label: string, query = label): Promise<void> {
  await searchLibrary(demo, query);
  await demo.click(libraryItem(demo.page, label), { fy: 0.4 });
}

/** Search the library and drag the item onto the canvas. */
export async function dragFromLibrary(demo: Demo, label: string, to: Point, opts: { query?: string; toAim?: Aim } = {}): Promise<void> {
  await searchLibrary(demo, opts.query ?? label);
  await demo.drag(libraryItem(demo.page, label), to, { fromAim: { fy: 0.4 }, toAim: opts.toAim });
}

/** A labelled control in the Properties panel (rows are "Label  control"). */
export function field(page: Page, label: string): Locator {
  return panel(page).getByLabel(label, { exact: true }).filter({ visible: true }).first();
}

/** Properties: a text / number field set by typing. */
export async function setField(demo: Demo, label: string, value: string): Promise<void> {
  await demo.fill(field(demo.page, label), value);
}

/** Properties: a select (Radix) set by opening it and clicking the option. */
export async function choose(demo: Demo, label: string, option: string): Promise<void> {
  await demo.click(field(demo.page, label), {}, { pause: 450 });
  await demo.click(demo.page.getByRole('option', { name: option, exact: true }));
}

/**
 * Brings a screen into view with real wheel input: scroll so its top centre sits near the top of
 * the canvas, then Ctrl+wheel to `zoom` × the current zoom around that point.
 */
export async function focusScreen(demo: Demo, name: string, zoom = 1, top = 36): Promise<void> {
  const c = (await canvas(demo.page).boundingBox())!;
  const b = await screenBox(demo.page, name);
  const anchor = { x: c.x + c.width / 2, y: c.y + top };
  await demo.move({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
  await demo.scroll(b.x + b.width / 2 - anchor.x, b.y - anchor.y);
  if (zoom !== 1) await demo.zoomAt(anchor, zoom);
}

/** Ids of the nearest rendered nodes inside a node (its children on the canvas, in drawing order). */
export async function childNodes(page: Page, parent: Locator): Promise<Locator[]> {
  const ids = await parent.evaluate((el) => {
    const out: string[] = [];
    const walk = (e: Element) => {
      for (const c of Array.from(e.children)) {
        const id = c.getAttribute('data-node-id');
        if (id) out.push(id);
        else walk(c);
      }
    };
    walk(el);
    return out;
  });
  return ids.map((id) => node(page, id));
}

/** The frame node of a screen (the top-level node right under its name label). */
export async function screenNode(page: Page, name: string): Promise<Locator> {
  const b = await screenBox(page, name);
  const id = await canvas(page).locator('[data-node-id]').evaluateAll((els, b) => {
    const hit = els.find((e) => {
      const r = e.getBoundingClientRect();
      return Math.abs(r.left - b.x) < 1 && Math.abs(r.top - b.y) < 1 && e.parentElement?.closest('[data-node-id]') == null;
    });
    return hit?.getAttribute('data-node-id') ?? null;
  }, b);
  if (!id) throw new Error(`No frame for "${name}"`);
  return node(page, id);
}

/** A point near the bottom of a screen's visible part (empty space in a short screen): a click there selects the screen. */
export async function screenBlank(page: Page, name: string): Promise<Point> {
  const b = await screenBox(page, name);
  const c = (await canvas(page).boundingBox())!;
  return { x: b.x + b.width / 2, y: Math.min(b.y + b.height, c.y + c.height) - 40 };
}
