// Links from parts of a component (docs/wireframe-mode.md → Links from parts of a component): parts and their
// rectangles, flows from a part, remapping when the list changes (reorder, rename, removal), links defined once in a
// shared component's master (every instance, present mode), the selected item that follows the screen, the export
// for AI and the project file.
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, findNode, type ComponentNode, type DesignDocument, type GroupNode, type ScreenNode } from '@/model';
import { parseProject, serializeProject } from '@/io/projectFile';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { aiMarkdown } from '../aiExport';
import { setComponentProp } from '../componentCommands';
import { addFlow, flowCurves, flowSources, flowsAt, flowsOf, newScreenFromFlow, partAt, partsOfId, partWorldRect, remapPartKey } from '../flows';
import { getComponent } from '../library/registry';
import { materializeDocument } from '../pipeline';
import { follow, hotspots, startPresent } from '../present';
import { frames } from '../screens';
import { deleteSymbolCommand, detachSymbolSelected } from '../symbolCommands';
import { newSymbolInstance, symbolsOf } from '../symbols';
import { NAV_LABELS, navProject } from '../spec/__tests__/fixtures';

const s = () => useDocStore.getState();
const NAV = 'tabbar~s~nav';
const navOn = (frame: string) => (frame === 'G' ? NAV : `tabbar-${frame}~s~nav`);
const screenId = (doc: DesignDocument, name: string) => doc.wireframe!.screens.find((x) => x.name === name)!.id;
const frameOfScreen = (doc: DesignDocument, name: string) => frames(doc).find((f) => f.screen.screenId === screenId(doc, name))!;
const comp = (doc: DesignDocument, id: string) => findNode(doc, id) as ComponentNode;
/** The x centre of the "Selected" pill a bottom navigation draws. */
function selectedCentre(doc: DesignDocument, id: string): number {
  const pill = (comp(doc, id).children as GroupNode[]).flatMap((c) => (c.type === 'group' ? c.children : [])).find((c) => c.name === 'Selected')!;
  return pill.transform.x;
}

beforeEach(() => {
  s().load(createDocument());
  useEditorStore.getState().setSelection([]);
});

describe('parts', () => {
  it('a bottom navigation has one part per item, side by side across its width, in document space', () => {
    const doc = navProject();
    const parts = partsOfId(doc, NAV);
    expect(parts.map((p) => p.key)).toEqual(['item:0', 'item:1', 'item:2', 'item:3']);
    expect(parts.map((p) => p.label)).toEqual(NAV_LABELS);
    expect(parts.map((p) => p.rect.width)).toEqual([97.5, 97.5, 97.5, 97.5]);
    const frame = frameOfScreen(doc, 'Gallery');
    const r = partWorldRect(doc, NAV, 'item:1')!;
    expect(r.x).toBeCloseTo(frame.transform.x + 97.5);
    expect(r.width).toBeCloseTo(97.5);
    expect(r.y + r.height).toBeCloseTo(frame.transform.y + frame.screen.height);
    expect(partAt(doc, NAV, { x: r.x + 10, y: r.y + 10 })?.label).toBe('Files');
    expect(partAt(doc, 'G', { x: r.x + 10, y: r.y + 10 })).toBeNull();
  });

  it('a top app bar has its back button and each action icon', () => {
    const doc = navProject();
    expect(partsOfId(doc, 'bar').map((p) => [p.key, p.label])).toEqual([
      ['back', 'Back'],
      ['action:0', 'Search'],
      ['action:1', expect.stringMatching(/^Share/)],
    ]);
  });

  it('flows start at the part: arrows and hotspots use its rectangle', () => {
    const doc = navProject();
    const tabsFlow = flowsOf(doc).find((f) => f.from === 'tabs')!;
    const [arrow] = flowCurves(doc, tabsFlow);
    const r = partWorldRect(doc, 'tabs', 'item:1')!;
    expect(arrow.curve.points[0].x).toBeCloseTo(r.x + r.width);
    expect(arrow.curve.points[0].y).toBeCloseTo(r.y + r.height / 2);
  });

  it('addFlow checks the part, New screen is named after the part', () => {
    const doc = structuredClone(navProject());
    expect(addFlow(doc, 'tabs', screenId(doc, 'Albums'), undefined, { part: 'item:9' })).toBeNull();
    const r = newScreenFromFlow(doc, 'tabs', { x: 0, y: 2000 }, { part: 'item:0' })!;
    expect(doc.wireframe!.screens.find((x) => x.id === r.screenId)!.name).toBe('Photos');
    expect(flowsOf(doc).find((f) => f.id === r.flowId)).toMatchObject({ from: 'tabs', part: 'item:0' });
  });
});

describe('remapping part flows when the list changes', () => {
  const def = getComponent('bottom-navigation')!;
  const labels = (l: string[]) => ({ labels: l });
  it('reorder: an item keeps its flow by label', () => {
    expect(remapPartKey(def, labels(['A', 'B', 'C']), labels(['C', 'A', 'B']), 'item:0')).toBe('item:1');
    expect(remapPartKey(def, labels(['A', 'B', 'C']), labels(['C', 'A', 'B']), 'item:2')).toBe('item:0');
  });
  it('rename: by its old index when the entry there is new', () => {
    expect(remapPartKey(def, labels(['A', 'B', 'C']), labels(['A', 'Bee', 'C']), 'item:1')).toBe('item:1');
  });
  it('removal: the flow goes (never handed to the neighbour)', () => {
    expect(remapPartKey(def, labels(['A', 'B', 'C']), labels(['A', 'C']), 'item:1')).toBeNull();
    expect(remapPartKey(def, labels(['A', 'B', 'C']), labels(['A', 'B']), 'item:2')).toBeNull();
  });
  it('fixed parts and unchanged lists keep their key', () => {
    expect(remapPartKey(def, labels(['A', 'B']), labels(['A', 'B']), 'item:1')).toBe('item:1');
    expect(remapPartKey(getComponent('top-app-bar')!, { title: 'a' }, { title: 'b' }, 'back')).toBe('back');
  });

  it('in the app: editing the tabs of an instance remaps the master flows and the selected tab, in one undo step', async () => {
    s().load(navProject());
    const doc0 = s().doc;
    const keyTo = (doc: DesignDocument, name: string) => flowsOf(doc).find((f) => f.symbol && f.to === screenId(doc, name))?.part;
    // Reorder (through the instance on Files): Files first.
    await setComponentProp(navOn('F'), 'labels', ['Files', 'Gallery', 'Albums', 'Settings']);
    let doc = s().doc;
    expect(keyTo(doc, 'Files')).toBe('item:0');
    expect(keyTo(doc, 'Gallery')).toBe('item:1');
    expect(comp(doc, navOn('F')).component.resolved).toEqual({ selected: 1 });
    expect(comp(doc, navOn('G')).component.resolved).toEqual({ selected: 2 });
    // Rename: Albums → Photos keeps its link.
    await setComponentProp(navOn('A'), 'labels', ['Files', 'Gallery', 'Photos', 'Settings']);
    doc = s().doc;
    expect(keyTo(doc, 'Albums')).toBe('item:2');
    expect(comp(doc, navOn('A')).component.resolved).toEqual({ selected: 3 });
    // Removal: Settings goes, and its link with it; the Settings screen falls back to the first tab.
    await setComponentProp(navOn('S'), 'labels', ['Files', 'Gallery', 'Photos']);
    doc = s().doc;
    expect(keyTo(doc, 'Settings')).toBeUndefined();
    expect(flowsOf(doc).filter((f) => f.symbol)).toHaveLength(3);
    expect(comp(doc, navOn('S')).component.resolved).toBeUndefined();
    // Undo puts the flow back with the tab.
    s().undo();
    expect(keyTo(s().doc, 'Settings')).toBe('item:3');
    s().undo();
    s().undo();
    expect(flowsOf(s().doc)).toEqual(flowsOf(doc0));
  });

  it('in the app: a flow on one instance (not shared) follows its tab too', async () => {
    s().load(navProject());
    await setComponentProp('tabs', 'labels', ['Videos', 'Photos']);
    expect(flowsOf(s().doc).find((f) => f.from === 'tabs')!.part).toBe('item:0');
    await setComponentProp('tabs', 'labels', ['Photos']);
    expect(flowsOf(s().doc).find((f) => f.from === 'tabs')).toBeUndefined();
  });
});

describe('links defined once in a shared component', () => {
  it('a flow in the master starts at that item on every instance', () => {
    const doc = navProject();
    const shared = flowsOf(doc).filter((f) => f.symbol);
    expect(shared).toHaveLength(4);
    for (const f of shared) expect(flowSources(doc, f).sort()).toEqual(['A', 'F', 'G', 'S'].map(navOn).sort());
    expect(flowsAt(doc, navOn('A')).filter((f) => f.symbol).map((f) => f.part)).toEqual(['item:0', 'item:1', 'item:2', 'item:3']);
  });

  it('"This screen only" stays on one instance', () => {
    const doc = structuredClone(navProject());
    const id = addFlow(doc, navOn('F'), screenId(doc, 'Gallery'), 'only here', { part: 'item:2' })!;
    const f = flowsOf(doc).find((x) => x.id === id)!;
    expect(f.symbol).toBeUndefined();
    expect(flowSources(doc, f)).toEqual([navOn('F')]);
    expect(flowsAt(doc, navOn('A')).some((x) => x.id === id)).toBe(false);
  });

  it('"Every screen using" needs an element inside an instance', () => {
    const doc = structuredClone(navProject());
    expect(addFlow(doc, 'tabs', screenId(doc, 'Albums'), undefined, { part: 'item:0', shared: true })).toBeNull();
    const again = addFlow(doc, navOn('A'), screenId(doc, 'Files'), undefined, { part: 'item:1', shared: true });
    expect(again).toBe(flowsOf(doc).find((f) => f.symbol && f.part === 'item:1')!.id); // the same link, not a second one
  });

  it('arrows: one per instance, none on the screen the item opens', () => {
    const doc = navProject();
    const files = flowsOf(doc).find((f) => f.symbol && f.part === 'item:1')!;
    expect(flowCurves(doc, files).map((c) => c.source).sort()).toEqual(['A', 'G', 'S'].map(navOn).sort());
  });

  it('a new instance gets the links with no work', () => {
    s().load(navProject());
    const sym = s().doc.wireframe!.symbols![0];
    const before = flowSources(s().doc, flowsOf(s().doc).find((f) => f.symbol)!).length;
    const extra = { ...newSymbolInstance(sym, symbolsOf(s().doc), { x: 0, y: 0 }) };
    s().apply((d) => void (d.children.find((c) => c.id === 'A') as ScreenNode).children.push(extra as never));
    expect(flowSources(s().doc, flowsOf(s().doc).find((f) => f.symbol)!)).toHaveLength(before + 1);
  });

  it('present mode: every screen has a hotspot per tab; tapping through the tabs moves between screens', () => {
    const doc = navProject();
    let st = startPresent(doc, ['G'])!;
    const spots = hotspots(doc, st).filter((h) => h.nodeId === NAV);
    expect(spots.map((h) => [h.part, h.label])).toEqual(NAV_LABELS.map((l, i) => [`item:${i}`, l]));
    expect(spots[1].rect.width).toBeCloseTo(97.5);
    for (const [i, name] of NAV_LABELS.entries()) {
      const spot = hotspots(doc, st).find((h) => h.nodeId === navOn(frameOfScreen(doc, frames(doc).find((f) => f.id === st.frameId)!.name).id) && h.part === `item:${i}`)!;
      st = follow(doc, st, spot.flow);
      expect(frames(doc).find((f) => f.id === st.frameId)!.name).toBe(name);
    }
    // Gallery (already there: nothing happens) → Files → Albums → Settings.
    expect(st.history).toHaveLength(3);
    // The other parts of Gallery: a tab and the top app bar's back and second action.
    expect(hotspots(doc, startPresent(doc, ['G'])!).filter((h) => h.nodeId !== NAV).map((h) => `${h.nodeId}#${h.part}`).sort()).toEqual(['bar#action:1', 'bar#back', 'tabs#item:1']);
  });

  it('detach keeps the links on that copy; deleting the master keeps them on every screen', () => {
    s().load(navProject());
    useEditorStore.getState().setSelection(['tabbar-F']);
    expect(detachSymbolSelected()).toBe(1);
    let doc = s().doc;
    expect(flowsOf(doc).filter((f) => !f.symbol && f.from === navOn('F'))).toHaveLength(4);
    expect(comp(doc, navOn('F')).component.resolved).toEqual({ selected: 2 });
    deleteSymbolCommand(doc.wireframe!.symbols![0].id);
    doc = s().doc;
    expect(flowsOf(doc).filter((f) => f.symbol)).toHaveLength(0);
    expect(flowsOf(doc).filter((f) => f.part?.startsWith('item:') && f.from !== 'tabs')).toHaveLength(16);
    for (const [i, frame] of ['G', 'F', 'A', 'S'].entries()) expect(comp(doc, navOn(frame)).component.resolved).toEqual({ selected: i + 1 });
  });
});

describe('selected: "auto"', () => {
  it('each screen draws its own tab selected, from one shared tab bar', () => {
    const doc = navProject();
    ['G', 'F', 'A', 'S'].forEach((frame, i) => {
      expect(comp(doc, navOn(frame)).component.props.selected).toBe('auto');
      expect(comp(doc, navOn(frame)).component.resolved).toEqual({ selected: i + 1 });
      expect(selectedCentre(doc, navOn(frame))).toBeCloseTo(97.5 * i + 97.5 / 2);
    });
    // The master stays clean: what is selected is per screen.
    const master = JSON.stringify(doc.wireframe!.symbols![0].content);
    expect(master).not.toContain('resolved');
  });

  it('without a link to the screen, the first item; a number keeps the old fixed behaviour', () => {
    const doc = navProject();
    expect(comp(doc, 'tabs').component.resolved).toBeUndefined(); // Photos / Videos: nothing opens Gallery
    const d2 = materializeDocument({ ...doc, wireframe: { ...doc.wireframe!, flows: flowsOf(doc).filter((f) => !f.symbol) } });
    expect(comp(d2, navOn('F')).component.resolved).toBeUndefined();
    expect(selectedCentre(d2, navOn('F'))).toBeCloseTo(97.5 / 2);
    s().load(doc);
    void setComponentProp(navOn('F'), 'selected', 4);
    // Shared: the fixed value is content, so every instance follows it.
    for (const frame of ['G', 'F', 'A', 'S']) expect(selectedCentre(s().doc, navOn(frame))).toBeCloseTo(97.5 * 3 + 97.5 / 2);
  });

  it('files that stored a number keep it: a link to the screen does not move the selection', () => {
    const doc = structuredClone(navProject());
    addFlow(doc, 'tabs', screenId(doc, 'Gallery'), undefined, { part: 'item:1' });
    expect(comp(materializeDocument(doc), 'tabs').component.resolved).toEqual({ selected: 2 });
    const fixed = structuredClone(doc);
    (findNode(fixed, 'tabs') as ComponentNode).component.props.selected = 1;
    expect(comp(materializeDocument(fixed), 'tabs').component.resolved).toBeUndefined();
  });
});

describe('export for AI', () => {
  it('writes the part links in the component line, once for a shared component', () => {
    const md = aiMarkdown(navProject());
    expect(md.readme).toContain('- Bottom navigation: Gallery (selected) → opens Gallery; Files → opens Files; Albums → opens Albums; Settings → opens Settings — the selected item follows the screen');
    expect(md.readme).toContain('- Gallery → Files (from "Files" in the bottom navigation)');
    expect(md.readme).not.toContain('- Files → Files');
    const gallery = md.screens.find((x) => x.name === 'Gallery')!.markdown;
    expect(gallery).toContain('- Tabs: Photos (selected); Videos → opens Files');
    expect(gallery).toMatch(/- Top app bar "Gallery", leading back button → opens Settings \("Back to settings"\), actions: Search, Share\S* → opens Albums/);
    expect(gallery).toContain('- Shared: Tab bar');
    expect(gallery).not.toContain('opens Gallery');
    const files = md.screens.find((x) => x.name === 'Files')!.markdown;
    expect(files).toContain('## Opened from');
    expect(files).toContain('- Gallery ("Files" in the bottom navigation)');
  });

  it('a bottom navigation on one screen (not shared) writes its links the same way', () => {
    const doc = navProject();
    const flows = flowsOf(doc).filter((f) => !f.symbol);
    const plainNav = structuredClone(materializeDocument({ ...doc, wireframe: { ...doc.wireframe!, flows } }));
    addFlow(plainNav, NAV, screenId(doc, 'Files'), undefined, { part: 'item:1' });
    addFlow(plainNav, NAV, screenId(doc, 'Gallery'), undefined, { part: 'item:0' });
    const md = aiMarkdown(materializeDocument(plainNav));
    // Inside a shared instance a flow on one copy is written under "Shared: Tab bar", with its source.
    expect(md.screens.find((x) => x.name === 'Gallery')!.markdown).toContain('→ opens Files (from "Files" in the bottom navigation)');
  });
});

describe('project file', () => {
  it('keeps part, symbol and resolved; drops a shared flow whose master or node is missing', () => {
    const doc = navProject();
    const back = parseProject(serializeProject(doc));
    expect(flowsOf(back)).toEqual(flowsOf(doc));
    expect(comp(back, navOn('A')).component.resolved).toEqual({ selected: 3 });
    const data = JSON.parse(serializeProject(doc));
    data.wireframe.flows.push({ id: 'x1', from: 'nav', to: data.wireframe.screens[0].id, part: 'item:0', symbol: 'nope' });
    data.wireframe.flows.push({ id: 'x2', from: 'missing', to: data.wireframe.screens[0].id, symbol: data.wireframe.symbols[0].id });
    const warnings: string[] = [];
    const loaded = parseProject(JSON.stringify(data), { warnings });
    expect(flowsOf(loaded).map((f) => f.id)).not.toContain('x1');
    expect(flowsOf(loaded).map((f) => f.id)).not.toContain('x2');
    expect(warnings.join('\n')).toMatch(/no shared component "nope"/);
    expect(warnings.join('\n')).toMatch(/no node "missing" in shared component/);
  });
});
