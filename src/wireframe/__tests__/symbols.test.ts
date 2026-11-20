// Phase 2 shared components (docs/wireframe-mode.md → Shared components): make, insert, edit
// propagation, undo, per-instance size, detach, delete master, nesting (in a repeat, in another master),
// duplicate / paste, flows, export, file validation.
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createGroup, createText, findNode, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type SceneNode, type ScreenNode, type TextNode } from '@/model';
import { parseProject, serializeProject, validateDocument } from '@/io/projectFile';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { aiMarkdown } from '../aiExport';
import { addFlow, flowsOf } from '../flows';
import { defaultScreenLayout } from '../layout';
import { insertComponent } from '../componentCommands';
import { insertIntoLayout, layoutDropTarget } from '../layoutEdit';
import { insertSymbol } from '../symbolCommands';
import { materializeDocument, runWireframePipeline } from '../pipeline';
import { copyPrefix } from '../repeat';
import { addScreen } from '../screens';
import symbolsStep from '../steps/symbols';
import {
  defaultSymbolName,
  deleteSymbol,
  detachSymbolInstance,
  inSync,
  instancePrefix,
  instancesOf,
  makeSymbol,
  makeSymbolProblem,
  newSymbolInstance,
  renameSymbol,
  symbolsOf,
} from '../symbols';

const s = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

const heading = (id: string, text: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'heading', props: { text, level: 'subheading' } } });
const image = (id: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'image', props: {} } });
const container = (id: string, layout: Partial<LayoutInfo> & { kind: LayoutInfo['kind'] }, children: SceneNode[] = []): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 0, padding: 0, align: 'stretch', ...layout } as LayoutInfo,
  children,
});
/** A custom "Trip card": card container (outline, radius, padding 16, gap 8) of image + heading. */
const card = (id: string) => container(id, { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' }, [image(`${id}-img`), heading(`${id}-title`, 'Lisbon')]);

/** Phone frames `A` (Home) at x 0 and `B` (Trips) at x 500, both vertical stacks. */
function twoScreens(a: SceneNode[], b: SceneNode[] = []): DesignDocument {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const ia = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0, layout: defaultScreenLayout('phone') });
  const ib = addScreen(doc, { platform: 'phone', name: 'Trips', x: 500, y: 0, layout: defaultScreenLayout('phone') });
  const fa = doc.children.find((n) => n.id === ia) as ScreenNode;
  const fb = doc.children.find((n) => n.id === ib) as ScreenNode;
  fa.id = 'A';
  fb.id = 'B';
  fa.children = a;
  fb.children = b;
  return materializeDocument(doc);
}
const node = <T extends SceneNode = GroupNode>(doc: DesignDocument, id: string) => findNode(doc, id) as T;
const title = (inst: string, master = 'c-title') => `${instancePrefix(inst)}${master}`;
const titleText = (doc: DesignDocument, inst: string) => node<ComponentNode>(doc, title(inst)).component.props.text;

/** Home has the card made into "Trip card"; Trips gets a second instance `i2`. Returns the master id. */
function setup(extraB: SceneNode[] = []): string {
  s().load(twoScreens([card('c')], extraB));
  let sym = '';
  s().apply((d) => void (sym = makeSymbol(d, 'c', 'Trip card')!), { label: 'Make component' });
  const master = symbolsOf(s().doc)[0];
  const inst = { ...newSymbolInstance(master, symbolsOf(s().doc), { x: 0, y: 0 }), id: 'i2' };
  inst.children = newSymbolInstance(master, symbolsOf(s().doc), { x: 0, y: 0 }).children.map((c) => ({ ...c, id: c.id.replace(/^[^~]+~s~/, instancePrefix('i2')) }));
  s().apply((d) => void insertIntoLayout(d, 'B', inst));
  return sym;
}

beforeEach(() => {
  s().load(createDocument());
  ed().setSelection([]);
});

describe('make component', () => {
  it('turns the selection into the first instance of a new master', () => {
    s().load(twoScreens([card('c')]));
    let sym = '';
    s().apply((d) => void (sym = makeSymbol(d, 'c', 'Trip card')!));
    const c = node(s().doc, 'c');
    expect(c.symbol).toEqual({ id: sym });
    expect(c.name).toBe('Trip card');
    expect(c.children.map((x) => x.id)).toEqual([title('c', 'c-img'), title('c')]);
    const [master] = symbolsOf(s().doc);
    expect(master).toMatchObject({ id: sym, name: 'Trip card' });
    // The master is not on the canvas and is in its own id space.
    expect(master.content.children.map((x) => x.id)).toEqual(['c-img', 'c-title']);
    expect(master.content.layout).toMatchObject({ kind: 'vstack', style: 'outline', padding: 16 });
    expect(inSync(c, master)).toBe(true);
    // One undo step.
    s().undo();
    expect(node(s().doc, 'c').symbol).toBeUndefined();
    expect(symbolsOf(s().doc)).toHaveLength(0);
  });

  it('only for groups and containers, with a default name from the container or its first label', () => {
    expect(makeSymbolProblem(card('x'))).toBeNull();
    expect(makeSymbolProblem(heading('h', 'x'))).toMatch(/already a component/);
    expect(makeSymbolProblem(createText({ text: 'x' }))).toMatch(/group or a container/);
    expect(makeSymbolProblem({ ...card('x'), symbol: { id: 's' } })).toMatch(/already/);
    expect(defaultSymbolName(card('x'))).toBe('x'); // a name the user gave it
    expect(defaultSymbolName({ ...card('x'), name: 'Card container' })).toBe('Lisbon'); // generic name: the first label
  });

  it('keeps the flows and notes of the elements inside', () => {
    s().load(twoScreens([card('c')]));
    s().apply((d) => void addFlow(d, 'c-title', s().doc.wireframe!.screens[1].id));
    s().apply((d) => void makeSymbol(d, 'c', 'Trip card'));
    expect(flowsOf(s().doc).map((f) => f.from)).toEqual([title('c')]);
  });
});

describe('editing an instance', () => {
  it('updates the master and every instance in one undo step', () => {
    setup();
    expect(instancesOf(s().doc, symbolsOf(s().doc)[0].id).map((n) => n.id)).toEqual(['c', 'i2']);
    expect(titleText(s().doc, 'i2')).toBe('Lisbon');
    s().updateNodes([title('i2')], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    expect(titleText(s().doc, 'c')).toBe('Porto');
    expect((symbolsOf(s().doc)[0].content.children[1] as ComponentNode).component.props.text).toBe('Porto');
    s().undo();
    expect(titleText(s().doc, 'c')).toBe('Lisbon');
    expect(titleText(s().doc, 'i2')).toBe('Lisbon');
    s().redo();
    expect(titleText(s().doc, 'c')).toBe('Porto');
  });

  it('adds and removes content everywhere; the layout places it in each instance', () => {
    setup();
    s().apply((d) => void insertIntoLayout(d, 'c', heading('extra', 'From Lisbon')));
    // added in c (keeps its own id there), materialized in i2 with the instance prefix
    expect(node(s().doc, 'c').children.map((x) => x.id)).toEqual([title('c', 'c-img'), title('c'), 'extra']);
    expect(node(s().doc, 'i2').children.map((x) => x.id)).toEqual([title('i2', 'c-img'), title('i2'), `${instancePrefix('i2')}extra`]);
    const ex = node<ComponentNode>(s().doc, `${instancePrefix('i2')}extra`);
    expect(ex.component.size!.width).toBeGreaterThan(0);
    expect(ex.transform.y).toBeGreaterThan(node(s().doc, title('i2')).transform.y);
    // removed in i2 → gone from c
    s().apply((d) => {
      const i2 = findNode(d as DesignDocument, 'i2') as GroupNode;
      i2.children.splice(0, 1);
    });
    expect(node(s().doc, 'c').children.map((x) => x.id)).toEqual([title('c'), 'extra']);
    expect(symbolsOf(s().doc)[0].content.children.map((x) => x.id)).toEqual(['c-title', 'extra']);
  });

  it('keeps position and size per instance (size follows the layout)', () => {
    setup();
    const before = node(s().doc, 'c');
    // i2 resized to a fixed width (as the resize handles do): only i2 changes
    s().updateNodes(['i2'], (n) => void (n.type === 'group' && (n.layoutItem = { ...n.layoutItem, width: 200 })));
    const i2 = node(s().doc, 'i2');
    expect(i2.layout!.size!.width).toBe(200);
    expect(node(s().doc, 'c')).toBe(before); // untouched, same identity
    expect(node<ComponentNode>(s().doc, title('i2')).component.size!.width).toBe(200 - 32);
    expect(node<ComponentNode>(s().doc, title('c')).component.size!.width).toBe(390 - 32 - 32);
    expect(inSync(i2, symbolsOf(s().doc)[0])).toBe(true);
    // a content edit in the narrow one still reaches the wide one, at its own width
    s().updateNodes([title('i2')], (n) => void ((n as ComponentNode).component.props.text = 'Faro'));
    expect(titleText(s().doc, 'c')).toBe('Faro');
    expect(node<ComponentNode>(s().doc, title('c')).component.size!.width).toBe(390 - 32 - 32);
  });

  it('runs once: the pipeline is idempotent on a document with instances', () => {
    setup();
    const doc = s().doc;
    expect(runWireframePipeline(doc, null, 'load', { patches: false })).toBeNull();
    expect(runWireframePipeline(doc, doc, 'settle')).toBeNull();
  });
});

describe('detach and delete master', () => {
  it('Detach turns one instance into plain content', () => {
    setup();
    s().updateNodes(['i2'], (n) => void detachSymbolInstance(n));
    expect(node(s().doc, 'i2').symbol).toBeUndefined();
    s().updateNodes([title('c')], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    expect(titleText(s().doc, 'i2')).toBe('Lisbon');
  });

  it('deleting the master detaches every instance (undoable), rename follows', () => {
    const sym = setup();
    s().apply((d) => void renameSymbol(d, sym, 'Destination card'));
    expect(symbolsOf(s().doc)[0].name).toBe('Destination card');
    expect(node(s().doc, 'c').name).toBe('Destination card');
    s().apply((d) => void deleteSymbol(d, sym));
    expect(s().doc.wireframe!.symbols).toBeUndefined();
    expect(node(s().doc, 'c').symbol).toBeUndefined();
    expect(node(s().doc, 'i2').symbol).toBeUndefined();
    expect(titleText(s().doc, 'i2')).toBe('Lisbon'); // content stays
    s().undo();
    expect(instancesOf(s().doc, sym)).toHaveLength(2);
  });
});

describe('nesting', () => {
  it('a repeat template can be an instance: its copies follow the master', () => {
    const sym = setup();
    // Trips: a list repeating the instance 3 times
    s().apply((d) => {
      const b = findNode(d as DesignDocument, 'B') as GroupNode;
      const i2 = b.children.splice(0, 1)[0];
      b.children.push(container('list', { kind: 'vstack', gap: 12, repeat: { count: 3 } }, [i2]) as never);
    });
    const list = node(s().doc, 'list');
    expect(list.children).toHaveLength(3);
    expect(list.children[1].repeatCopy).toEqual({ template: 'i2', index: 2 });
    // edit on Home → template and its copies on Trips
    s().updateNodes([title('c')], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    expect(titleText(s().doc, 'i2')).toBe('Porto');
    const copyTitle = node<ComponentNode>(s().doc, copyPrefix('i2', 3) + title('i2'));
    expect(copyTitle.component.props.text).toBe('Porto');
    expect(instancesOf(s().doc, sym).map((n) => n.id)).toEqual(['c', 'i2']); // copies are not instances of their own
    // the export says it once
    const trips = aiMarkdown(s().doc).screens.find((x) => x.name === 'Trips')!.markdown;
    expect(trips).toContain('List of 3 × (Shared: Trip card)');
  });

  it('a master can hold an instance of another one; editing the inner one reaches every outer instance', () => {
    s().load(twoScreens([container('outer', { kind: 'vstack', gap: 4 }, [card('c'), heading('caption', 'Featured')])]));
    let inner = '';
    let outer = '';
    s().apply((d) => void (inner = makeSymbol(d, 'c', 'Trip card')!));
    s().apply((d) => void (outer = makeSymbol(d, 'outer', 'Featured trip')!));
    const masters = symbolsOf(s().doc);
    const o = masters.find((m) => m.id === outer)!;
    // nested instances are stored without children
    expect((o.content.children[0] as GroupNode).symbol).toEqual({ id: inner });
    expect((o.content.children[0] as GroupNode).children).toEqual([]);
    const ins = newSymbolInstance(o, masters, { x: 0, y: 0 });
    s().apply((d) => void insertIntoLayout(d, 'B', ins));
    const nestedId = `${instancePrefix(ins.id)}${instancePrefix('outer')}c`.replace(`${instancePrefix('outer')}`, '');
    const nested = node(s().doc, nestedId);
    expect(nested.symbol).toEqual({ id: inner });
    const nestedTitle = `${instancePrefix(nestedId)}c-title`;
    expect(node<ComponentNode>(s().doc, nestedTitle).component.props.text).toBe('Lisbon');
    // edit the inner card inside the first outer instance
    const firstTitle = `${instancePrefix(`${instancePrefix('outer')}c`)}c-title`;
    s().updateNodes([firstTitle], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    expect(node<ComponentNode>(s().doc, nestedTitle).component.props.text).toBe('Porto');
    // the export describes Featured trip with its nested card by name
    const readme = aiMarkdown(s().doc).readme;
    expect(readme).toContain('### Featured trip');
    expect(readme).toMatch(/### Featured trip[\s\S]*- Shared: Trip card/);
  });

  it('a master never contains itself', () => {
    const sym = setup();
    const masters = symbolsOf(s().doc);
    // put an instance of Trip card inside the Trip card instance c
    const loop = newSymbolInstance(masters[0], masters, { x: 0, y: 0 });
    s().apply((d) => void insertIntoLayout(d, 'c', loop));
    const content = symbolsOf(s().doc)[0].content;
    const walk = (n: SceneNode): boolean => n.type === 'group' && (n.symbol?.id === sym || n.children.some(walk));
    expect(content.children.some(walk)).toBe(false);
  });
});

describe('inserting next to an instance', () => {
  const idsB = () => (node(s().doc, 'B') as unknown as ScreenNode).children.map((c) => c.id);

  it('a shared component inserted while one of its instances is selected goes after it', () => {
    const sym = setup();
    ed().setSelection(['i2']);
    const id = insertSymbol(sym);
    expect(id).not.toBeNull();
    expect(idsB()).toEqual(['i2', id]);
    expect(node(s().doc, id!).symbol).toEqual({ id: sym });
    expect(ed().selection).toEqual([id]);
  });

  it('also when something inside the instance is selected', () => {
    const sym = setup();
    ed().setSelection([title('i2')]);
    const id = insertSymbol(sym);
    expect(idsB()).toEqual(['i2', id]);
  });

  it('a library component goes after the selected instance, not inside it', async () => {
    setup();
    ed().setSelection(['i2']);
    const id = await insertComponent('heading');
    expect(idsB()).toEqual(['i2', id]);
    expect(node(s().doc, 'i2').children.map((c) => c.id)).toEqual([title('i2', 'c-img'), title('i2')]);
  });

  it('a drop on an instance targets the stack around it, not the instance', () => {
    const sym = setup();
    const b = node(s().doc, 'B');
    const i2 = node(s().doc, 'i2');
    const point = { x: b.transform.x + i2.transform.x + 20, y: b.transform.y + i2.transform.y + 20 };
    expect(layoutDropTarget(s().doc, point)?.containerId).toBe('B');
    const id = insertSymbol(sym, point);
    expect(id).not.toBeNull();
    expect(idsB()).toContain(id);
    expect(node(s().doc, 'i2').children).toHaveLength(2);
  });
});

describe('duplicate, paste, flows', () => {
  it('a duplicate stays linked (same master), with instance ids, and keeps the flows of its elements', () => {
    const sym = setup();
    s().apply((d) => void addFlow(d, title('i2'), s().doc.wireframe!.screens[0].id));
    const [copy] = s().duplicate(['i2']);
    const dup = node(s().doc, copy);
    expect(dup.symbol).toEqual({ id: sym });
    expect(dup.children.map((x) => x.id)).toEqual([title(copy, 'c-img'), title(copy)]);
    expect(flowsOf(s().doc).map((f) => f.from).sort()).toEqual([title('i2'), title(copy)].sort());
    s().updateNodes([title(copy)], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    expect(titleText(s().doc, 'c')).toBe('Porto');
  });

  it('a flow from inside an instance stays on that instance; it goes when the element is deleted anywhere', () => {
    setup();
    const home = s().doc.wireframe!.screens[0].id;
    s().apply((d) => void addFlow(d, title('i2'), home));
    s().updateNodes([title('c')], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    expect(flowsOf(s().doc).map((f) => f.from)).toEqual([title('i2')]);
    const md = aiMarkdown(s().doc).screens.find((x) => x.name === 'Trips')!.markdown;
    expect(md).toMatch(/- Shared: Trip card\n\s+- → opens Home \(from "Porto" heading\)/);
    // the title deleted in c → gone from i2 → its flow goes, same undo step
    s().apply((d) => void (findNode(d as DesignDocument, 'c') as GroupNode).children.splice(1, 1));
    expect(findNode(s().doc, title('i2'))).toBeNull();
    expect(flowsOf(s().doc)).toEqual([]);
  });

  it('an instance whose master is missing (pasted from another document) becomes a plain group', () => {
    s().load(twoScreens([card('c')]));
    s().apply((d) => {
      (findNode(d as DesignDocument, 'c') as GroupNode).symbol = { id: 'nope' };
    });
    expect(node(s().doc, 'c').symbol).toBeUndefined();
  });
});

describe('export for AI', () => {
  it('describes each shared component once and refers to it by name', () => {
    setup();
    const m = aiMarkdown(s().doc);
    expect(m.readme).toContain('## Shared components');
    expect(m.readme).toContain('### Trip card');
    expect(m.readme).toContain('Used on: Home, Trips.');
    expect(m.readme).toMatch(/### Trip card[\s\S]*- Card container \(outlined[^)]*\)\n\s+- Image/);
    expect(m.readme).toContain('"Shared: Trip card" is a shared component');
    for (const sc of m.screens) {
      expect(sc.markdown).toContain('- Shared: Trip card');
      expect(sc.markdown).not.toContain('Lisbon'); // the content is in the README, not repeated per screen
    }
  });
});

describe('file format', () => {
  it('round-trips masters and instances', () => {
    const sym = setup();
    const doc = parseProject(serializeProject(s().doc));
    expect(symbolsOf(doc)).toEqual(symbolsOf(s().doc));
    expect(symbolsOf(doc).map((x) => x.id)).toEqual([sym]);
    expect(node(doc, 'i2').symbol).toEqual({ id: sym });
    // Loaded instances already match their masters: the symbols step has nothing to do.
    expect(runWireframePipeline(doc, null, 'load', { steps: [symbolsStep] })).toBeNull();
  });

  it('loads an instance of a missing master as a plain group, with a warning', () => {
    setup();
    const data = JSON.parse(serializeProject(s().doc));
    data.wireframe.symbols = [];
    const warnings: string[] = [];
    const doc = validateDocument(data, { warnings });
    expect(node(doc, 'c').symbol).toBeUndefined();
    expect(node(doc, 'c').children).toHaveLength(2);
    expect(warnings.some((w) => /symbol\.id: unknown shared component/.test(w))).toBe(true);
  });

  it('rejects broken masters with the JSON path; ignores the fields outside wireframes', () => {
    setup();
    const data = JSON.parse(serializeProject(s().doc));
    data.wireframe.symbols[0].content = { type: 'rect', width: 1, height: 1 };
    expect(() => validateDocument(data)).toThrow(/wireframe\.symbols\[0\]\.content\.type/);
    const logo = JSON.parse(serializeProject(createDocument()));
    logo.children = [{ ...createGroup(), symbol: { id: 'x' } }];
    const warnings: string[] = [];
    const doc = validateDocument(logo, { warnings });
    expect((doc.children[0] as GroupNode).symbol).toBeUndefined();
    expect(warnings[0]).toMatch(/only wireframe documents/);
  });

  it('a text node inside a master keeps its content', () => {
    s().load(twoScreens([{ ...container('g', { kind: 'vstack' }, [createText({ text: 'Hello' })]), name: 'Vertical stack' }]));
    s().apply((d) => void makeSymbol(d, 'g', ''));
    const [m] = symbolsOf(s().doc);
    expect(m.name).toBe('Hello');
    expect((m.content.children[0] as TextNode).text).toBe('Hello');
  });
});

describe('performance', () => {
  it('10 screens × 10 instances: a drag frame and an edit that reaches 100 instances stay fast', () => {
    const doc = createDocument({ name: 'P', wireframe: { screens: [] } });
    const frames: ScreenNode[] = [];
    for (let i = 0; i < 10; i++) {
      const id = addScreen(doc, { platform: 'phone', name: `S${i}`, x: i * 500, y: 0, layout: defaultScreenLayout('phone') });
      frames.push(doc.children.find((n) => n.id === id) as ScreenNode);
    }
    frames[0].children = [card('c')];
    s().load(materializeDocument(doc));
    s().apply((d) => void makeSymbol(d, 'c', 'Trip card'));
    const m = symbolsOf(s().doc)[0];
    s().apply((d) => {
      for (const f of frames) for (let k = 0; k < (f === frames[0] ? 9 : 10); k++) insertIntoLayout(d, f.id, newSymbolInstance(m, [m], { x: 0, y: 0 }));
    });
    expect(instancesOf(s().doc, m.id)).toHaveLength(100);
    // a drag frame of one instance (change phase, inside a transaction)
    s().beginTransaction('Move');
    let t = performance.now();
    for (let i = 0; i < 20; i++) s().updateNodes(['c'], (n) => void (n.transform.x += 1));
    const frame = (performance.now() - t) / 20;
    s().commitTransaction();
    // an edit inside one instance, propagated to the 99 others
    t = performance.now();
    s().updateNodes([title('c')], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    const edit = performance.now() - t;
    const last = instancesOf(s().doc, m.id)[99];
    expect(node<ComponentNode>(s().doc, title(last.id)).component.props.text).toBe('Porto');
    console.info(`symbols perf: drag frame ${frame.toFixed(2)} ms, edit → 100 instances ${edit.toFixed(1)} ms`);
    expect(frame).toBeLessThan(16);
    expect(edit).toBeLessThan(500);
  });
});
