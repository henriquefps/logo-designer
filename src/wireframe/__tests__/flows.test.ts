import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createGroup, createRect, createText, findNode, type ComponentNode, type DesignDocument, type GroupNode, type ScreenNode } from '@/model';
import { parseProject, serializeProject, validateDocument } from '@/io/projectFile';
import { exportSvg } from '@/io/svgExport';
import { useDocStore } from '@/store/useDocStore';
import {
  addFlow,
  canFlowFrom,
  flowAt,
  flowRoute,
  flowSource,
  flowSourceLabel,
  flowsFrom,
  flowsOf,
  flowsTo,
  flowTarget,
  frameAt,
  newScreenFromFlow,
  pruneFlows,
  removeFlow,
  screenStatus,
  setFlowLabel,
  setScreenStatus,
} from '../flows';
import { materializeDocument } from '../pipeline';
import { addScreen, duplicateScreenAs, frames, variantsOf } from '../screens';

const s = () => useDocStore.getState();

const comp = (id: string, kind: string, props: Record<string, unknown>): ComponentNode => ({ ...createGroup({ name: `${kind} ${id}` }), id, component: { kind, props } });

/**
 * Settings (phone, with a "Language" list row, a "Server" button and a text) at x=0, Language (phone +
 * tablet) at x=600, Server (phone) at x=1200, all materialized.
 */
function fixture(): { doc: DesignDocument; settings: string; language: string; languageTablet: string; server: string } {
  const doc = createDocument({ name: 'App', wireframe: { screens: [] } });
  const settings = addScreen(doc, { platform: 'phone', name: 'Settings', x: 0, y: 0 });
  (doc.children.find((n) => n.id === settings) as ScreenNode).children = [
    comp('row', 'list-row', { title: 'Language', trailing: 'value', value: 'English' }),
    comp('btn', 'button', { label: 'Server' }),
    createText({ id: 'txt', text: 'About\nthis app' }),
    { ...createGroup({ name: 'Plain group' }), id: 'grp', children: [createRect({ id: 'grp-rect', width: 20, height: 20 })] },
  ];
  const language = addScreen(doc, { platform: 'phone', name: 'Language', x: 600, y: 0 });
  const languageTablet = addScreen(doc, { platform: 'tablet', name: 'Language', x: 600, y: 1000, screenId: (doc.children.find((n) => n.id === language) as ScreenNode).screen.screenId });
  const server = addScreen(doc, { platform: 'phone', name: 'Server', x: 1800, y: 0 });
  return { doc: materializeDocument(doc), settings, language, languageTablet, server };
}

const screenIdOf = (doc: DesignDocument, frameId: string) => (findNode(doc, frameId) as ScreenNode).screen.screenId;

beforeEach(() => s().load(createDocument()));

describe('model', () => {
  it('adds, labels and removes flows; a second link between the same two reuses the flow', () => {
    const { doc, language } = structuredClone(fixture());
    const to = screenIdOf(doc, language);
    const id = addFlow(doc, 'row', to)!;
    expect(flowsOf(doc)).toEqual([{ id, from: 'row', to }]);
    expect(addFlow(doc, 'row', to, ' tap ')).toBe(id);
    expect(flowsOf(doc)[0].label).toBe('tap');
    expect(setFlowLabel(doc, id, '')).toBe(true);
    expect(flowsOf(doc)[0]).not.toHaveProperty('label');
    expect(flowsFrom(doc, 'row')).toHaveLength(1);
    expect(flowsTo(doc, to)).toHaveLength(1);
    expect(removeFlow(doc, id)).toBe(true);
    expect(doc.wireframe!.flows).toBeUndefined();
  });

  it('only starts flows at elements inside a screen, and resolves generated children to their instance', () => {
    const { doc, settings, language } = structuredClone(fixture());
    const to = screenIdOf(doc, language);
    const generated = (findNode(doc, 'row') as GroupNode).children[0].id;
    expect(flowSource(doc, generated)).toBe('row');
    expect(canFlowFrom(doc, generated)).toBe(false);
    expect(canFlowFrom(doc, 'row')).toBe(true);
    expect(canFlowFrom(doc, 'grp-rect')).toBe(true); // a shape inside a plain group is an element
    expect(canFlowFrom(doc, settings)).toBe(false); // the frame itself
    expect(addFlow(doc, settings, to)).toBeNull();
    expect(addFlow(doc, 'row', 'nope')).toBeNull();
    expect(addFlow(doc, generated, to)).not.toBeNull();
    expect(flowsOf(doc)[0].from).toBe('row');
    doc.children.push(createRect({ id: 'loose', width: 10, height: 10, transform: { x: -500, y: -500 } }));
    expect(canFlowFrom(doc, 'loose')).toBe(false);
  });

  it('screen status: set, clear, kept through the pipeline', () => {
    const { doc, settings } = structuredClone(fixture());
    const id = screenIdOf(doc, settings);
    expect(screenStatus(doc, id)).toBeUndefined();
    expect(setScreenStatus(doc, id, 'changed')).toBe(true);
    expect(setScreenStatus(doc, id, 'changed')).toBe(false);
    expect(screenStatus(materializeDocument(structuredClone(doc)), id)).toBe('changed');
    setScreenStatus(doc, id, null);
    expect(doc.wireframe!.screens.find((x) => x.id === id)).not.toHaveProperty('status');
  });

  it('prunes flows whose source node or target screen is gone', () => {
    const { doc, language, server } = structuredClone(fixture());
    addFlow(doc, 'row', screenIdOf(doc, language));
    addFlow(doc, 'btn', screenIdOf(doc, server));
    expect(pruneFlows(doc)).toBe(0);
    doc.wireframe!.screens = doc.wireframe!.screens.filter((x) => x.id !== screenIdOf(doc, server));
    expect(pruneFlows(doc)).toBe(1);
    (doc.children[0] as GroupNode).children.shift(); // the row
    expect(pruneFlows(doc)).toBe(1);
    expect(doc.wireframe!.flows).toBeUndefined();
  });

  it('Duplicate as… gives the copied elements the same flows', () => {
    const { doc, settings, language } = structuredClone(fixture());
    addFlow(doc, 'row', screenIdOf(doc, language), 'tap');
    const copy = duplicateScreenAs(doc, settings, 'tablet')!;
    const copiedRow = (findNode(doc, copy) as ScreenNode).children[0].id;
    expect(flowsFrom(doc, copiedRow)).toEqual([expect.objectContaining({ to: screenIdOf(doc, language), label: 'tap' })]);
  });
});

describe('target resolution', () => {
  it('points at the variant with the source platform, else the first', () => {
    const { doc, settings, language, languageTablet } = structuredClone(fixture());
    const to = screenIdOf(doc, language);
    const flow = { from: 'row', to };
    expect(flowTarget(doc, flow)!.id).toBe(language);
    const tablet = duplicateScreenAs(doc, settings, 'tablet')!;
    expect(flowTarget(doc, flow, findNode(doc, tablet) as ScreenNode)!.id).toBe(languageTablet);
    const desktop = duplicateScreenAs(doc, settings, 'desktop')!;
    expect(flowTarget(doc, flow, findNode(doc, desktop) as ScreenNode)!.id).toBe(language); // no desktop variant: the first
    expect(variantsOf(doc, to)).toHaveLength(2);
    expect(flowTarget(doc, { from: 'row', to: 'missing' })).toBeNull();
  });

  it('draws an arrow from the element to the nearest edge of the target frame', () => {
    const { doc, language } = structuredClone(fixture());
    addFlow(doc, 'row', screenIdOf(doc, language));
    const c = flowRoute(doc, flowsOf(doc)[0])!;
    const start = c.points[0];
    const end = c.points[c.points.length - 1];
    expect(start.x).toBeCloseTo(390, 0); // the row spans the phone frame (edge to edge)
    expect(end.x).toBe(600); // left edge of Language
    expect(c.dir).toEqual({ x: 1, y: 0 });
    expect(flowAt(doc, end, 2)).toBe(flowsOf(doc)[0].id);
    expect(flowAt(doc, { x: end.x, y: end.y + 200 }, 2)).toBeNull();
    // Hidden source: no arrow.
    (findNode(doc, 'row') as GroupNode).visible = false;
    expect(flowRoute(doc, flowsOf(doc)[0])).toBeNull();
  });

  it('frameAt finds the frame under a point', () => {
    const { doc, server } = fixture();
    expect(frameAt(doc, { x: 1900, y: 100 })!.id).toBe(server);
    expect(frameAt(doc, { x: 500, y: 100 })).toBeNull();
  });
});

describe('New screen from a dropped flow', () => {
  it('creates a frame of the same platform at the drop point, named after the source, linked by a flow', () => {
    const { doc } = structuredClone(fixture());
    const made = newScreenFromFlow(doc, 'btn', { x: 3000.4, y: 200 })!;
    const frame = findNode(doc, made.frameId) as ScreenNode;
    expect(frame.name).toBe('Server 2'); // "Server" is taken
    expect(frame.screen.platform).toBe('phone');
    expect(frame.transform).toMatchObject({ x: 3000, y: 200 });
    expect(flowsFrom(doc, 'btn')).toEqual([expect.objectContaining({ id: made.flowId, to: made.screenId })]);
    expect(newScreenFromFlow(doc, 'nope', { x: 0, y: 0 })).toBeNull();
  });

  it('names the screen after the label, title or text, else the node name', () => {
    const { doc } = fixture();
    expect(flowSourceLabel(doc, 'row')).toBe('Language');
    expect(flowSourceLabel(doc, 'btn')).toBe('Server');
    expect(flowSourceLabel(doc, 'txt')).toBe('About this app');
    expect(flowSourceLabel(doc, 'grp')).toBe('Plain group');
  });

  it('is one undo step in the app', () => {
    const { doc } = fixture();
    s().load(doc);
    const before = frames(s().doc).length;
    s().apply((d) => void newScreenFromFlow(d, 'row', { x: 3000, y: 0 }), { label: 'New screen from flow' });
    expect(frames(s().doc)).toHaveLength(before + 1);
    expect(frames(s().doc).at(-1)!.name).toBe('Language 2');
    expect(flowsOf(s().doc)).toHaveLength(1);
    s().undo();
    expect(frames(s().doc)).toHaveLength(before);
    expect(s().doc.wireframe!.flows).toBeUndefined();
  });
});

describe('cleanup on delete (pipeline, same undo step)', () => {
  it('deleting the source element removes its flows; undo restores them', () => {
    const { doc, language } = fixture();
    s().load(doc);
    s().apply((d) => void addFlow(d, 'row', screenIdOf(d as DesignDocument, language)));
    expect(flowsOf(s().doc)).toHaveLength(1);
    s().deleteNodes(['row']);
    expect(s().doc.wireframe!.flows).toBeUndefined();
    s().undo();
    expect(findNode(s().doc, 'row')).toBeTruthy();
    expect(flowsOf(s().doc)).toHaveLength(1);
    s().redo();
    expect(s().doc.wireframe!.flows).toBeUndefined();
  });

  it('deleting every frame of the target logical screen removes the flows to it; one variant is not enough', () => {
    const { doc, language, languageTablet, server } = fixture();
    s().load(doc);
    s().apply((d) => {
      addFlow(d, 'row', screenIdOf(d as DesignDocument, language));
      addFlow(d, 'btn', screenIdOf(d as DesignDocument, server));
    });
    s().deleteNodes([language]);
    expect(flowsOf(s().doc)).toHaveLength(2); // the tablet variant is still there
    s().deleteNodes([languageTablet]);
    expect(flowsOf(s().doc).map((f) => f.from)).toEqual(['btn']);
    s().undo();
    expect(flowsOf(s().doc)).toHaveLength(2);
  });

  it('deleting the source screen removes the flows of its elements', () => {
    const { doc, settings, server } = fixture();
    s().load(doc);
    s().apply((d) => void addFlow(d, 'btn', screenIdOf(d as DesignDocument, server)));
    s().deleteNodes([settings]);
    expect(s().doc.wireframe!.flows).toBeUndefined();
    s().undo();
    expect(flowsOf(s().doc)).toHaveLength(1);
  });
});

describe('file format', () => {
  it('round-trips flows and status', () => {
    const { doc, settings, language } = structuredClone(fixture());
    addFlow(doc, 'row', screenIdOf(doc, language), 'tap');
    setScreenStatus(doc, screenIdOf(doc, settings), 'current');
    const back = parseProject(serializeProject(doc));
    expect(back.wireframe!.flows).toEqual(doc.wireframe!.flows);
    expect(screenStatus(back, screenIdOf(back, settings))).toBe('current');
  });

  it('drops flows with an unknown source or target, and an unknown status, with warnings', () => {
    const { doc, language } = structuredClone(fixture());
    const to = screenIdOf(doc, language);
    const raw = JSON.parse(serializeProject(doc));
    raw.wireframe.screens[0].status = 'someday';
    raw.wireframe.flows = [
      { id: 'a', from: 'row', to },
      { id: 'b', from: 'ghost', to },
      { id: 'c', from: 'btn', to: 'nowhere' },
      { from: 'btn', to, label: '  ' },
    ];
    const warnings: string[] = [];
    const back = validateDocument(raw, { warnings });
    expect(back.wireframe!.flows!.map((f) => f.from)).toEqual(['row', 'btn']);
    expect(back.wireframe!.flows![1].id).toBeTruthy();
    expect(back.wireframe!.flows![1]).not.toHaveProperty('label');
    expect(back.wireframe!.screens[0]).not.toHaveProperty('status');
    expect(warnings.join('\n')).toMatch(/wireframe\.flows\[1\]\.from: ignored flow, no node "ghost"/);
    expect(warnings.join('\n')).toMatch(/wireframe\.flows\[2\]\.to: ignored flow, no logical screen "nowhere"/);
    expect(warnings.join('\n')).toMatch(/wireframe\.screens\[0\]\.status: ignored/);
  });

  it('names the JSON path of a malformed flow', () => {
    const raw = JSON.parse(serializeProject(fixture().doc));
    raw.wireframe.flows = [{ id: 'x', from: 3, to: 's' }];
    expect(() => validateDocument(raw)).toThrow(/wireframe\.flows\[0\]\.from: expected a string/);
  });

  it('arrows are never part of a screen export', async () => {
    const { doc, settings, language } = structuredClone(fixture());
    addFlow(doc, 'row', screenIdOf(doc, language), 'Choose language');
    const { svg } = await exportSvg(doc, { scope: 'screen', screenId: settings, outlineText: false });
    expect(svg).not.toContain('Choose language');
    expect(svg).not.toContain('flow');
  });
});
