// Shared components with per-instance content (docs/wireframe-mode.md → Shared components → Slots and
// text overrides): slot children are each instance's own, a new instance starts with the master's, nested
// masters keep their slots, drops land in slots and never in the shared part, text overrides survive master
// edits and reset, and the spec round-trips both.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createGroup, findNode, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type SceneNode, type ScreenNode, type WireframeSymbol } from '@/model';
import { parseProject, serializeProject } from '@/io/projectFile';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { copyNodes, pasteNodes } from '@/store/clipboard';
import { aiMarkdown } from '../aiExport';
import { insertComponent, resetComponentTextCommand, setComponentProp, shareComponentTextCommand } from '../componentCommands';
import { defaultScreenLayout } from '../layout';
import { insertIntoLayout, layoutDropTarget } from '../layoutEdit';
import { materializeDocument, runWireframePipeline } from '../pipeline';
import { addScreen } from '../screens';
import { buildFromSpec, dumpToSpec } from '../spec';
import { insertSymbol } from '../symbolCommands';
import { importSymbols } from '../symbolImport';
import { inSync, instancePrefix, makeSymbol, newSymbolInstance, overriddenProps, sharedOwner, symbolsOf } from '../symbols';

const s = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

const heading = (id: string, text: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'heading', props: { text, level: 'subheading' } } });
const container = (id: string, layout: Partial<LayoutInfo> & { kind: LayoutInfo['kind'] }, children: SceneNode[] = []): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 0, padding: 0, align: 'stretch', ...layout } as LayoutInfo,
  children,
});
/** "App shell": a top bar heading and a card container `body` that is a slot (content per instance). */
const shell = (id: string, body: SceneNode[] = []) =>
  container(id, { kind: 'vstack', gap: 8, padding: 8 }, [heading(`${id}-top`, 'Acme'), container(`${id}-body`, { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small', slot: true }, body)]);

function twoScreens(a: SceneNode[], b: SceneNode[] = []): DesignDocument {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const ia = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0, layout: defaultScreenLayout('phone') });
  const ib = addScreen(doc, { platform: 'phone', name: 'Inbox', x: 500, y: 0, layout: defaultScreenLayout('phone') });
  const fa = doc.children.find((n) => n.id === ia) as ScreenNode;
  const fb = doc.children.find((n) => n.id === ib) as ScreenNode;
  fa.id = 'A';
  fb.id = 'B';
  fa.children = a;
  fb.children = b;
  return materializeDocument(doc);
}
const node = <T extends SceneNode = GroupNode>(doc: DesignDocument, id: string) => findNode(doc, id) as T;
const pid = (inst: string, master: string) => `${instancePrefix(inst)}${master}`;
const master = (): WireframeSymbol => symbolsOf(s().doc)[0];
const textOf = (id: string) => node<ComponentNode>(s().doc, id).component.props.text;

/** Home's shell made into "App shell" (default slot content: one heading); a second instance `i2` on Inbox. */
function setup(defaults: SceneNode[] = [heading('hint', 'Welcome')]) {
  s().load(twoScreens([shell('sh', defaults)]));
  s().apply((d) => void makeSymbol(d, 'sh', 'App shell'), { label: 'Make component' });
  const inst = { ...newSymbolInstance(master(), symbolsOf(s().doc), { x: 0, y: 0 }) };
  const id = inst.id;
  s().apply((d) => void insertIntoLayout(d, 'B', inst));
  return { a: 'sh', b: id, bodyA: pid('sh', 'sh-body'), bodyB: pid(id, 'sh-body') };
}

/** The document point at the centre of a node's laid-out box. */
function centre(id: string) {
  let x = 0;
  let y = 0;
  const visit = (nodes: readonly SceneNode[]): boolean => {
    for (const n of nodes) {
      if (n.id === id || (n.type === 'group' && visit(n.children))) {
        x += n.transform.x;
        y += n.transform.y;
        return true;
      }
    }
    return false;
  };
  visit(s().doc.children);
  const n = node(s().doc, id);
  const size = n.layout?.size ?? { width: 0, height: 0 };
  return { x: x + size.width / 2, y: y + size.height / 2 };
}

beforeEach(() => {
  s().load(createDocument());
  ed().setSelection([]);
});

describe('slots: content per instance', () => {
  it('sync ignores slot children: each instance keeps its own, the master keeps the defaults', () => {
    const { a, b, bodyA, bodyB } = setup();
    // a new instance starts with the master's slot children
    expect(node(s().doc, bodyB).children.map((c) => c.id)).toEqual([pid(b, 'hint')]);
    // A's slot gets its own content
    s().apply((d) => void insertIntoLayout(d, bodyA, heading('mine', 'Only on Home')));
    expect(node(s().doc, bodyA).children.map((c) => c.id)).toEqual([pid(a, 'hint'), 'mine']);
    expect(node(s().doc, bodyB).children.map((c) => c.id)).toEqual([pid(b, 'hint')]);
    expect((master().content.children[1] as GroupNode).children.map((c) => c.id)).toEqual(['hint']);
    expect(inSync(node(s().doc, a), master())).toBe(true);
    // B's own content, one undo step
    s().apply((d) => {
      const body = findNode(d as DesignDocument, bodyB) as GroupNode;
      body.children.splice(0, 1, heading('theirs', 'Only on Inbox') as never);
    });
    expect(node(s().doc, bodyB).children.map((c) => c.id)).toEqual(['theirs']);
    expect(node(s().doc, bodyA).children.map((c) => c.id)).toEqual([pid(a, 'hint'), 'mine']);
    s().undo();
    expect(node(s().doc, bodyB).children.map((c) => c.id)).toEqual([pid(b, 'hint')]);
  });

  it('a master edit outside the slot reaches every instance and keeps their slot content', () => {
    const { a, b, bodyA, bodyB } = setup();
    s().apply((d) => void insertIntoLayout(d, bodyA, heading('mine', 'Only on Home')));
    s().apply((d) => void insertIntoLayout(d, bodyB, heading('theirs', 'Only on Inbox')));
    // the top bar edited in B (a plain document edit, not a text override)
    s().updateNodes([pid(b, 'sh-top')], (n) => void ((n as ComponentNode).component.props.level = 'title'));
    expect(node<ComponentNode>(s().doc, pid(a, 'sh-top')).component.props.level).toBe('title');
    expect(node(s().doc, bodyA).children.map((c) => c.id)).toEqual([pid(a, 'hint'), 'mine']);
    expect(node(s().doc, bodyB).children.map((c) => c.id)).toEqual([pid(b, 'hint'), 'theirs']);
    // the slot container itself is shared (its style)
    s().updateNodes([bodyB], (n) => void (n.type === 'group' && n.layout && (n.layout.style = 'filled')));
    expect(node(s().doc, bodyA).layout!.style).toBe('filled');
    expect(node(s().doc, bodyA).children.map((c) => c.id)).toEqual([pid(a, 'hint'), 'mine']);
    expect(runWireframePipeline(s().doc, s().doc, 'settle')).toBeNull();
  });

  it('marking a container as a slot in one instance keeps every instance’s content', () => {
    s().load(twoScreens([container('sh', { kind: 'vstack' }, [heading('sh-top', 'Acme'), container('sh-body', { kind: 'vstack' }, [heading('x', 'Default')])])]));
    s().apply((d) => void makeSymbol(d, 'sh', 'App shell'));
    const inst = newSymbolInstance(master(), symbolsOf(s().doc), { x: 0, y: 0 });
    s().apply((d) => void insertIntoLayout(d, 'B', inst));
    s().updateNodes([pid('sh', 'sh-body')], (n) => void (n.type === 'group' && n.layout && (n.layout.slot = true)));
    expect((master().content.children[1] as GroupNode).layout!.slot).toBe(true);
    expect(node(s().doc, pid(inst.id, 'sh-body')).layout!.slot).toBe(true);
    // from now on the content is per instance
    s().apply((d) => void insertIntoLayout(d, pid('sh', 'sh-body'), heading('own', 'Own')));
    expect(node(s().doc, pid(inst.id, 'sh-body')).children).toHaveLength(1);
    expect((master().content.children[1] as GroupNode).children.map((c) => c.id)).toEqual(['x']);
  });

  it('duplicates and pastes keep their slot content; files round-trip slots', () => {
    const { a, bodyA } = setup();
    s().apply((d) => void insertIntoLayout(d, bodyA, heading('mine', 'Only on Home')));
    ed().setSelection([a]);
    copyNodes([a]);
    ed().setSelection([]);
    const [copy] = pasteNodes();
    const body = node(s().doc, copy).children.find((c) => c.type === 'group' && c.layout?.slot) as GroupNode;
    expect(body.children.map((c) => (c as ComponentNode).component.props.text)).toEqual(['Welcome', 'Only on Home']);
    const back = parseProject(serializeProject(s().doc));
    expect((back.wireframe!.symbols![0].content.children[1] as GroupNode).layout!.slot).toBe(true);
    expect(node(back, bodyA).children.map((c) => c.id)).toEqual([pid(a, 'hint'), 'mine']);
  });

  it('import from another project carries the slot flag and the default content', () => {
    setup();
    const source = structuredClone(s().doc);
    const target = createDocument({ name: 'T', wireframe: { screens: [] } });
    const plan = importSymbols(target, source);
    expect(plan.added).toHaveLength(1);
    const body = target.wireframe!.symbols![0].content.children[1] as GroupNode;
    expect(body.layout!.slot).toBe(true);
    expect(body.children.map((c) => (c as ComponentNode).component.props.text)).toEqual(['Welcome']);
    // the same master with other default content is not the same component
    const other = structuredClone(source);
    ((other.wireframe!.symbols![0].content.children[1] as GroupNode).children[0] as ComponentNode).component.props.text = 'Hello';
    expect(importSymbols(target, other).added).toHaveLength(1);
    expect(importSymbols(target, source).added).toHaveLength(0);
  });

  it('nested masters keep their own slots', () => {
    // "List section" (a heading + a slot) inside the App shell's slot default, and inside another master.
    s().load(twoScreens([container('sec', { kind: 'vstack' }, [heading('sec-title', 'Section'), container('sec-items', { kind: 'vstack', slot: true }, [heading('it', 'Item')])])]));
    s().apply((d) => void makeSymbol(d, 'sec', 'List section'));
    const section = master();
    // a page master that holds a List section in its shared part
    s().apply((d) => {
      const a = findNode(d as DesignDocument, 'A') as GroupNode;
      a.children.push(container('page', { kind: 'vstack' }, [heading('page-top', 'Page'), newSymbolInstance(section, symbolsOf(s().doc), { x: 0, y: 0 })]) as never);
    });
    s().apply((d) => void makeSymbol(d, 'page', 'Page'));
    const page = symbolsOf(s().doc).find((m) => m.name === 'Page')!;
    const inner = node(s().doc, 'page').children[1] as GroupNode;
    expect(inner.symbol?.id).toBe(section.id);
    const second = newSymbolInstance(page, symbolsOf(s().doc), { x: 0, y: 0 });
    s().apply((d) => void insertIntoLayout(d, 'B', second));
    const innerB = node(s().doc, second.id).children[1] as GroupNode;
    const slotA = inner.children[1] as GroupNode;
    const slotB = innerB.children[1] as GroupNode;
    expect(slotB.layout!.slot).toBe(true);
    // fill the nested slot in the first Page: only there
    s().apply((d) => void insertIntoLayout(d, slotA.id, heading('own', 'Own item')));
    expect(node(s().doc, slotA.id).children).toHaveLength(2);
    expect(node(s().doc, slotB.id).children).toHaveLength(1);
    // what is in the nested slot is the instance's own; the slot container itself is the List section's
    expect(sharedOwner([...findPathTo(slotA.id), node(s().doc, slotA.id)])).toBeNull();
    expect(sharedOwner(findPathTo(slotA.id))?.id).toBe(inner.id);
    // the Page master is unchanged; the List section master too
    expect((symbolsOf(s().doc).find((m) => m.id === section.id)!.content.children[1] as GroupNode).children.map((c) => c.id)).toEqual(['it']);
    // a Page edit outside (its top) reaches both and keeps the nested slot content
    s().updateNodes([pid(second.id, 'page-top')], (n) => void ((n as ComponentNode).component.props.level = 'title'));
    expect(node<ComponentNode>(s().doc, pid('page', 'page-top')).component.props.level).toBe('title');
    expect(node(s().doc, slotA.id).children).toHaveLength(2);
    // a List section edit (its title level) reaches the nested ones and keeps their slots
    s().updateNodes([`${instancePrefix(innerB.id)}sec-title`], (n) => void ((n as ComponentNode).component.props.level = 'title'));
    expect(node<ComponentNode>(s().doc, `${instancePrefix(inner.id)}sec-title`).component.props.level).toBe('title');
    expect(node<ComponentNode>(s().doc, pid('sec', 'sec-title')).component.props.level).toBe('title');
    expect(node(s().doc, slotA.id).children).toHaveLength(2);
    expect(node(s().doc, slotB.id).children).toHaveLength(1);
  });
});

function findPathTo(id: string): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (nodes: readonly SceneNode[]): boolean => {
    for (const n of nodes) {
      out.push(n);
      if (n.id === id || (n.type === 'group' && visit(n.children))) return true;
      out.pop();
    }
    return false;
  };
  visit(s().doc.children);
  out.pop();
  return out;
}

describe('drop targets', () => {
  it('a drop on a slot lands in it, with the insertion index; the shared part is not a target', async () => {
    const { a, bodyA } = setup([]);
    const p = centre(bodyA);
    expect(layoutDropTarget(s().doc, p)).toEqual({ containerId: bodyA, index: 0 });
    // the top bar of the shell: the screen around the instance (before / after it), never the shell itself
    const top = centre(pid(a, 'sh-top'));
    const onTop = layoutDropTarget(s().doc, { x: top.x, y: top.y - 10 });
    expect(onTop?.containerId).toBe('A');
    // a library component dropped on the slot goes in, and only this instance gets it
    const id = await insertComponent('list-row', p);
    expect(node(s().doc, bodyA).children.map((c) => c.id)).toEqual([id]);
    expect((master().content.children[1] as GroupNode).children).toEqual([]);
    // a shared component dropped there too
    const other = symbolsOf(s().doc)[0];
    expect(other).toBeDefined();
  });

  it('click-insert with the instance selected fills its slot', async () => {
    const { b, bodyB } = setup([]);
    ed().setSelection([b]);
    const id = await insertComponent('heading');
    expect(node(s().doc, bodyB).children.map((c) => c.id)).toEqual([id]);
    // with something in the shared part selected: next to the instance, as before
    ed().setSelection([pid(b, 'sh-top')]);
    const next = await insertComponent('heading');
    expect((node(s().doc, 'B') as unknown as ScreenNode).children.map((c) => c.id)).toEqual([b, next]);
  });

  it('paste with a slot selected goes into it', () => {
    const { bodyA } = setup([]);
    s().apply((d) => void insertIntoLayout(d, 'B', heading('loose', 'Loose')));
    copyNodes(['loose']);
    ed().setSelection([bodyA]);
    const [id] = pasteNodes();
    expect(node(s().doc, bodyA).children.map((c) => c.id)).toEqual([id]);
  });

  it('an instance of a component dropped into its own slot is refused', () => {
    const { bodyA } = setup([]);
    expect(insertSymbol(master().id, centre(bodyA))).toBeNull();
  });

  it('a plain empty card container takes drops', async () => {
    s().load(twoScreens([container('card', { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' })]));
    const p = centre('card');
    expect(layoutDropTarget(s().doc, p)).toEqual({ containerId: 'card', index: 0 });
    const id = await insertComponent('button', p);
    expect(node(s().doc, 'card').children.map((c) => c.id)).toEqual([id]);
  });
});

describe('text overrides', () => {
  /** "Acme · List row": a vstack holding one list row; two instances. */
  function rows() {
    const row: ComponentNode = { ...createGroup({ name: 'Row' }), id: 'row', component: { kind: 'list-row', props: { title: 'Item name' } } };
    s().load(twoScreens([container('lr', { kind: 'vstack' }, [row])]));
    s().apply((d) => void makeSymbol(d, 'lr', 'Acme · List row'));
    const inst = newSymbolInstance(master(), symbolsOf(s().doc), { x: 0, y: 0 });
    s().apply((d) => void insertIntoLayout(d, 'B', inst));
    return { a: pid('lr', 'row'), b: pid(inst.id, 'row'), inst: inst.id };
  }

  it('an instance keeps its own text across a master edit; reset goes back to the master’s', async () => {
    const { a, b, inst } = rows();
    await setComponentProp(b, 'title', 'Inbox');
    expect(textOfRow(b)).toBe('Inbox');
    expect(textOfRow(a)).toBe('Item name');
    expect((master().content.children[0] as ComponentNode).component.props.title).toBe('Item name');
    expect(node(s().doc, inst).symbol!.text).toEqual({ row: { title: 'Inbox' } });
    expect(overriddenProps(s().doc, b)).toEqual(['title']);
    expect(overriddenProps(s().doc, a)).toEqual([]);
    // the master's text changes (a plain edit in the other instance): the override stays, the other follows
    s().updateNodes([a], (n) => void ((n as ComponentNode).component.props.title = 'Messages'));
    expect((master().content.children[0] as ComponentNode).component.props.title).toBe('Messages');
    expect(textOfRow(b)).toBe('Inbox');
    // an edit of another prop in the overriding instance reaches the master, not its text
    s().updateNodes([b], (n) => void ((n as ComponentNode).component.props.subtitle = 'Two lines'));
    expect((master().content.children[0] as ComponentNode).component.props).toMatchObject({ title: 'Messages', subtitle: 'Two lines' });
    expect(textOfRow(b)).toBe('Inbox');
    expect(node<ComponentNode>(s().doc, a).component.props.subtitle).toBe('Two lines');
    // reset (one undo step)
    resetComponentTextCommand(b, 'title');
    expect(textOfRow(b)).toBe('Messages');
    expect(node(s().doc, inst).symbol!.text).toBeUndefined();
    s().undo();
    expect(textOfRow(b)).toBe('Inbox');
    // the master's text again: the instance without an override follows
    s().redo();
    s().updateNodes([a], (n) => void ((n as ComponentNode).component.props.title = 'Mail'));
    expect(textOfRow(b)).toBe('Mail');
  });

  it('use in every instance: the override becomes the master’s text', async () => {
    const { a, b, inst } = rows();
    await setComponentProp(b, 'title', 'Inbox');
    shareComponentTextCommand(b, 'title');
    expect((master().content.children[0] as ComponentNode).component.props.title).toBe('Inbox');
    expect(textOfRow(a)).toBe('Inbox');
    expect(node(s().doc, inst).symbol!.text).toBeUndefined();
    // typing the master's text again clears an override
    await setComponentProp(b, 'title', 'Later');
    await setComponentProp(b, 'title', 'Inbox');
    expect(node(s().doc, inst).symbol!.text).toBeUndefined();
  });

  it('overrides survive the file and the pipeline (idempotent)', async () => {
    const { b, inst } = rows();
    await setComponentProp(b, 'title', 'Inbox');
    const warnings: string[] = [];
    const back = parseProject(serializeProject(s().doc), { warnings });
    expect(warnings).toEqual([]);
    expect((findNode(back, inst) as GroupNode).symbol!.text).toEqual({ row: { title: 'Inbox' } });
    expect((findNode(back, b) as ComponentNode).component.props.title).toBe('Inbox');
    expect(runWireframePipeline(s().doc, null, 'load', { patches: false })).toBeNull();
  });

  it('the export for AI writes the instance’s text and slot content under it', async () => {
    const { b } = rows();
    await setComponentProp(b, 'title', 'Inbox');
    const inbox = aiMarkdown(s().doc).screens.find((x) => x.name === 'Inbox')!.markdown;
    expect(inbox).toMatch(/Shared: Acme · List row — text: Row "Inbox"/);
    s().load(createDocument());
    const { bodyB } = setup([]);
    s().apply((d) => void insertIntoLayout(d, bodyB, heading('own', 'Only on Inbox')));
    const md = aiMarkdown(s().doc).screens.find((x) => x.name === 'Inbox')!.markdown;
    expect(md).toMatch(/Shared: App shell, content:\n\s+- .*Only on Inbox/);
    expect(aiMarkdown(s().doc).readme).toMatch(/content per instance/);
  });
});

const textOfRow = (id: string) => node<ComponentNode>(s().doc, id).component.props.title;
void textOf;

describe('spec', () => {
  const spec = {
    components: [
      {
        name: 'App shell',
        content: { vstack: [{ heading: 'Acme', name: 'Top' }, { vstack: [{ text: 'Welcome' }], name: 'Body', slot: true, style: 'outline' }], gap: 8 },
      },
      { name: 'Acme · List row', content: { vstack: [{ 'list-row': { title: 'Item name' }, name: 'Row' }] } },
    ],
    screens: [
      { name: 'Home', platform: 'phone', root: [{ use: 'App shell', content: [{ heading: 'Home only' }, { use: 'Acme · List row', text: { Row: 'Inbox' } }] }] },
      { name: 'Inbox', platform: 'phone', root: [{ use: 'App shell' }] },
    ],
  };

  it('builds slot content and text overrides per instance, and dumps them back', () => {
    const { doc } = buildFromSpec(spec);
    const homeShell = (doc.children.find((f) => f.type === 'group' && f.screen && f.name === 'Home') as GroupNode).children[0] as GroupNode;
    const body = homeShell.children[1] as GroupNode;
    expect(body.layout!.slot).toBe(true);
    expect(body.children).toHaveLength(2);
    const row = body.children[1] as GroupNode;
    expect(row.symbol!.text).toBeDefined();
    expect(((row.children[0] as ComponentNode).component.props as { title: string }).title).toBe('Inbox');
    const inboxShell = (doc.children.find((f) => f.type === 'group' && f.screen && f.name === 'Inbox') as GroupNode).children[0] as GroupNode;
    // no content: the master's default
    expect((inboxShell.children[1] as GroupNode).children).toHaveLength(1);
    const dumped = dumpToSpec(doc);
    const home = dumped.screens.find((x) => x.name === 'Home')!.root![0] as Record<string, unknown>;
    expect(home.use).toBe('App shell');
    expect((home.content as unknown[]).length).toBe(2);
    expect(((home.content as Record<string, unknown>[])[1] as Record<string, unknown>).text).toEqual({ Row: 'Inbox' });
    const inbox = dumped.screens.find((x) => x.name === 'Inbox')!.root![0] as Record<string, unknown>;
    expect(inbox.content).toBeUndefined();
    expect((dumped.components![0].content as Record<string, unknown[]>).vstack[1]).toMatchObject({ slot: true });
    // the committed JSON Schema accepts both the hand-written spec and the dump
    const schema = JSON.parse(readFileSync(resolve(__dirname, '../../../public/schema/wireframe-spec.schema.json'), 'utf8'));
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    expect(validate(spec), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(dumped), JSON.stringify(validate.errors)).toBe(true);
    // round trip: the dump builds the same project
    const again = buildFromSpec(dumped, doc).doc;
    expect(dumpToSpec(again)).toEqual(dumped);
  });

  it('reports a bad slot name or text key', () => {
    expect(() => buildFromSpec({ ...spec, screens: [{ name: 'X', platform: 'phone', root: [{ use: 'Acme · List row', text: { Nope: 'x' } }] }] })).toThrow(/Nope/);
    expect(() => buildFromSpec({ ...spec, screens: [{ name: 'X', platform: 'phone', root: [{ use: 'Acme · List row', content: [{ heading: 'x' }] }] }] })).toThrow(/no slot/);
  });
});
