import { describe, expect, it } from 'vitest';
import { createDocument, createGroup, findNode, type ComponentNode, type DesignDocument, type ScreenNode } from '@/model';
import { addFlow } from '../flows';
import { materializeDocument } from '../pipeline';
import { back, canGoBack, follow, hotspots, platformsOf, presentedFrame, resolveTarget, startPresent, switchPlatform } from '../present';
import { addScreen, duplicateScreenAs } from '../screens';

const comp = (id: string, kind: string, props: Record<string, unknown>): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind, props } });
const sid = (doc: DesignDocument, frame: string) => (findNode(doc, frame) as ScreenNode).screen.screenId;

/** Home (phone + tablet) → List (phone + tablet) → Detail (phone only). Rows: home-row → List, list-row → Detail. */
function fixture() {
  const doc = createDocument({ name: 'App', wireframe: { screens: [] } });
  const home = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0 });
  const list = addScreen(doc, { platform: 'phone', name: 'List', x: 600, y: 0 });
  const detail = addScreen(doc, { platform: 'phone', name: 'Detail', x: 1200, y: 0 });
  (doc.children.find((n) => n.id === home) as ScreenNode).children = [comp('home-row', 'list-row', { title: 'Open list' })];
  (doc.children.find((n) => n.id === list) as ScreenNode).children = [comp('list-row', 'list-row', { title: 'Open detail' }), comp('hidden-row', 'list-row', { title: 'Hidden' })];
  const ready = structuredClone(materializeDocument(doc));
  const homeTablet = duplicateScreenAs(ready, home, 'tablet')!;
  const listTablet = duplicateScreenAs(ready, list, 'tablet')!;
  addFlow(ready, 'home-row', sid(ready, list));
  addFlow(ready, 'list-row', sid(ready, detail));
  addFlow(ready, 'hidden-row', sid(ready, detail));
  (findNode(ready, 'hidden-row') as ComponentNode).visible = false;
  return { doc: materializeDocument(ready), home, list, detail, homeTablet, listTablet };
}

describe('start', () => {
  it('starts at the selected screen (or an element inside it), else the first', () => {
    const { doc, home, list } = fixture();
    expect(startPresent(doc, [list])!.frameId).toBe(list);
    expect(startPresent(doc, ['list-row'])!.frameId).toBe(list);
    expect(startPresent(doc, [])!.frameId).toBe(home);
    expect(startPresent(doc, ['missing'])!.frameId).toBe(home);
    expect(startPresent(doc, [list])!.history).toEqual([]);
  });

  it('has nothing to show without screens', () => {
    expect(startPresent(createDocument({ wireframe: { screens: [] } }))).toBeNull();
  });
});

describe('navigation', () => {
  it('follows flows, pushes history and goes back', () => {
    const { doc, home, list, detail } = fixture();
    let s = startPresent(doc)!;
    expect(canGoBack(s)).toBe(false);
    s = follow(doc, s, hotspots(doc, s)[0].flow);
    expect(s).toEqual({ frameId: list, history: [home] });
    s = follow(doc, s, hotspots(doc, s)[0].flow);
    expect(s).toEqual({ frameId: detail, history: [home, list] });
    s = back(doc, s);
    expect(s).toEqual({ frameId: list, history: [home] });
    s = back(doc, s);
    expect(s).toEqual({ frameId: home, history: [] });
    expect(back(doc, s)).toBe(s);
  });

  it('ignores flows that lead nowhere or to the same frame', () => {
    const { doc, home, list } = fixture();
    const s = startPresent(doc)!;
    expect(follow(doc, s, { from: 'home-row', to: 'missing' })).toBe(s);
    expect(follow(doc, s, { from: 'home-row', to: sid(doc, home) })).toBe(s);
    expect(follow(doc, s, { from: 'home-row', to: sid(doc, list) }).frameId).toBe(list);
  });

  it('skips frames that no longer exist when going back', () => {
    const { doc, home, list, detail } = fixture();
    const s = { frameId: detail, history: [home, list] };
    const without = { ...doc, children: doc.children.filter((c) => c.id !== list) } as DesignDocument;
    expect(back(without, s)).toEqual({ frameId: home, history: [] });
  });
});

describe('platform', () => {
  it('lists the variants of the screen on show and switches without touching the history', () => {
    const { doc, home, homeTablet } = fixture();
    const s = startPresent(doc)!;
    expect(platformsOf(doc, s)).toEqual(['phone', 'tablet']);
    const t = switchPlatform(doc, s, 'tablet');
    expect(t).toEqual({ frameId: homeTablet, history: [] });
    expect(switchPlatform(doc, t, 'phone').frameId).toBe(home);
    expect(switchPlatform(doc, s, 'desktop')).toBe(s);
  });

  it('follows flows to the same platform when the target has it, else the first variant', () => {
    const { doc, list, listTablet, detail } = fixture();
    const tablet = switchPlatform(doc, startPresent(doc)!, 'tablet');
    expect(resolveTarget(doc, tablet, { from: 'home-row', to: sid(doc, list) })!.id).toBe(listTablet);
    const onList = follow(doc, tablet, { from: 'home-row', to: sid(doc, list) });
    expect(onList.frameId).toBe(listTablet);
    // Detail only exists as a phone frame.
    expect(follow(doc, onList, { from: 'list-row', to: sid(doc, detail) }).frameId).toBe(detail);
    expect(platformsOf(doc, { frameId: detail, history: [] })).toEqual(['phone']);
  });
});

describe('hotspots', () => {
  it('are the shown elements with flows, in frame space and inside the frame', () => {
    const { doc, list } = fixture();
    const s = startPresent(doc, [list])!;
    const spots = hotspots(doc, s);
    expect(spots.map((h) => h.nodeId)).toEqual(['list-row']); // hidden-row is not shown
    const frame = presentedFrame(doc, s)!;
    const r = spots[0].rect;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(frame.screen.width);
    expect(r.y + r.height).toBeLessThanOrEqual(frame.screen.height);
    expect(r.width).toBeGreaterThan(0);
  });

  it('are none on a screen without flows', () => {
    const { doc, detail } = fixture();
    expect(hotspots(doc, { frameId: detail, history: [] })).toEqual([]);
  });
});
