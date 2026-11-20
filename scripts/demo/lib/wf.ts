// Wireframe gestures shared by the long scenarios (overview, promo): finding nodes the agent built by what they are,
// selecting nested nodes, the agent job panel, tabs of a bottom navigation and linking them.
import type { Aim, Demo } from './demo.ts';
import { canvas, canvasText, screenBox } from './designer.ts';
import { newestRow } from './agent.ts';

export const dialog = (demo: Demo) => demo.page.getByRole('dialog');

export interface DocNode {
  id: string;
  name: string;
  component?: { kind: string; props: Record<string, unknown> };
  symbol?: { id: string };
  screen?: { screenId: string };
  children?: DocNode[];
}
export type W = { __designer: { useDocStore: { getState(): { doc: { children: DocNode[]; wireframe: { screens: { id: string; name: string; status?: string }[] } } } } } };

/**
 * The id of the first node (depth first) on the screen called `screen` that `pred` accepts: the agent builds the
 * screens, so their structure differs between runs and nodes are found by what they are, not by a fixed path.
 */
export async function findId(demo: Demo, screen: string, pred: { kind?: string; text?: string; nth?: number; up?: number }): Promise<string> {
  const id = await demo.page.evaluate(
    ([sc, p]) => {
      const d = (window as unknown as W).__designer.useDocStore.getState().doc;
      const s = d.wireframe.screens.find((x) => x.name === sc);
      const frame = d.children.find((c) => c.screen?.screenId === s?.id);
      const hits: string[] = [];
      const walk = (n: DocNode, up: string[]) => {
        const props = JSON.stringify(n.component?.props ?? {});
        if ((!p.kind || n.component?.kind === p.kind) && (!p.text || props.includes(p.text))) hits.push(p.up ? up[up.length - p.up] : n.id);
        if (!n.component) for (const c of n.children ?? []) walk(c, [...up, n.id]);
      };
      for (const c of frame?.children ?? []) walk(c, []);
      return hits[p.nth ?? 0] ?? null;
    },
    [screen, pred] as const,
  );
  if (!id) throw new Error(`no ${JSON.stringify(pred)} on “${screen}”`);
  return id;
}

/** Hides the agent job panel when it shows (it comes back after a reload of the dev server; a no-op in a recording). */
export async function hideJobs(demo: Demo): Promise<void> {
  const b = demo.page.getByTestId('agent-job-panel').getByRole('button', { name: 'Hide agent jobs' });
  if (await b.isVisible().catch(() => false)) await b.click();
}

/** While the agent works the screens it builds stay in view: the job panel goes (the terminal strip shows progress). */
export async function hideJobsFor(demo: Demo, ms = 1400): Promise<string> {
  const id = (await newestRow(demo.page).getAttribute('data-job-id'))!;
  await demo.pause(ms);
  const b = demo.page.getByTestId('agent-job-panel').getByRole('button', { name: 'Hide agent jobs' });
  if (await b.isVisible().catch(() => false)) await demo.click(b, {}, { pause: 300 });
  return id;
}

/** The job panel again, from the agent status in the status bar (its popover → Show jobs). */
export async function showJobs(demo: Demo): Promise<void> {
  // The panel opens by itself when a job ends; only when it was hidden again.
  if (await newestRow(demo.page).isVisible().catch(() => false)) return;
  await demo.click(demo.page.getByTestId('agent-status').first(), {}, { pause: 500 });
  await demo.click(demo.page.getByRole('button', { name: 'Show jobs' }), {}, { pause: 400 });
  // The status popover stays open over the panel: close it.
  await demo.key('Escape', { show: false });
}

/** Pans the canvas (wheel) so `screen` sits near its left edge: room on the right for what the agent adds. */
export async function screenToLeft(demo: Demo, screen: string, margin = 60): Promise<void> {
  const c = (await canvas(demo.page).boundingBox())!;
  const b = await screenBox(demo.page, screen);
  await demo.move({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
  await demo.scroll(b.x - (c.x + margin), 0);
}

export const nodeLoc = (demo: Demo, id: string) => demo.page.locator(`[data-slot="canvas"] [data-node-id="${id}"]`).first();

/** Selects a node nested in stacks: a click selects the outermost, each double-click goes one level in. */
export async function selectDeep(demo: Demo, id: string, aim: Aim = {}): Promise<void> {
  const depth = await demo.page.evaluate((target) => {
    const d = (window as unknown as W).__designer.useDocStore.getState().doc;
    const path = (n: DocNode, acc: string[]): string[] | null => {
      if (n.id === target) return acc;
      for (const c of n.children ?? []) {
        const r = path(c, [...acc, n.id]);
        if (r) return r;
      }
      return null;
    };
    for (const top of d.children) {
      const r = path(top, []);
      if (r) return r.length;
    }
    return 0;
  }, id);
  const loc = nodeLoc(demo, id);
  await demo.click(loc, aim);
  for (let i = 2; i < depth + 1; i++) {
    // A double-click right after another counts as a triple click: wait out the click interval.
    await demo.page.waitForTimeout(650);
    await demo.dblclick(loc, aim);
  }
}

/** The tab with this label inside the bottom navigation of a screen (its text on the canvas, low in the frame). */
export async function tabOn(demo: Demo, screen: string, label: string): Promise<{ x: number; y: number }> {
  const b = await screenBox(demo.page, screen);
  const texts = canvasText(demo.page, new RegExp(`^${label}$`));
  const n = await texts.count();
  // The lowest one inside the frame's columns (the frame's DOM box also holds a list that overflows it).
  let best: { x: number; y: number; width: number; height: number } | null = null;
  for (let i = 0; i < n; i++) {
    const r = await texts.nth(i).boundingBox();
    if (r && r.x >= b.x && r.x <= b.x + b.width && r.y > b.y + 80 && (!best || r.y > best.y)) best = r;
  }
  if (!best) throw new Error(`No tab "${label}" on ${screen}`);
  return { x: best.x + best.width / 2, y: best.y - 8 };
}

/** Hover a tab of the selected bottom navigation, drag its part handle onto a screen, link it on every screen using the bar. */
export async function linkTab(demo: Demo, from: string, label: string, to: string): Promise<void> {
  await demo.hover(await tabOn(demo, from, label), {}, 600);
  const handle = canvas(demo.page).locator('[data-slot="part-handle"] circle');
  await demo.drag(handle, await demo.point(await screenBox(demo.page, to), { fx: 0.5, fy: 0.35 }), { duration: 1100, hold: 600 });
  await demo.click(demo.page.getByRole('menuitem', { name: /^Every screen using/ }), {}, { pause: 700 });
}

