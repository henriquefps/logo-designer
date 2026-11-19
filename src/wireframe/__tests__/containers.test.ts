// Phase 1.5 R2–R4 (docs/wireframe-mode.md): containers as library elements, container appearance,
// repeat. Pipeline, layout, editing, hit testing, export and file format.
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createGroup, findNode, hitTest, nodesInRect, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type SceneNode, type ScreenNode } from '@/model';
import { exportSvg } from '@/io/svgExport';
import { parseProject, serializeProject, validateDocument } from '@/io/projectFile';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { aiMarkdown } from '../aiExport';
import { insertContainer, setContainerStyle, setRepeat, changeKind } from '../containerCommands';
import { CONTAINER_PRESETS, containerBackground, EMPTY_CONTAINER, newContainer } from '../containers';
import { defaultScreenLayout } from '../layout';
import { layoutDropTarget, unwrapLayout } from '../layoutEdit';
import { materializeDocument, runWireframePipeline } from '../pipeline';
import { copyPrefix, repeatChildren } from '../repeat';
import { addScreen } from '../screens';
import { WF_CONTAINER } from '../style';

const s = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

const box = (id: string, height: number): ComponentNode => ({
  ...createGroup({ name: id }),
  id,
  component: { kind: 'placeholder', props: { label: id, height } },
});
const heading = (id: string, text: string): ComponentNode => ({
  ...createGroup({ name: id }),
  id,
  component: { kind: 'heading', props: { text, level: 'subheading' } },
});
const image = (id: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'image', props: {} } });
const container = (id: string, layout: Partial<LayoutInfo> & { kind: LayoutInfo['kind'] }, children: SceneNode[] = []): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 0, padding: 0, align: 'stretch', ...layout } as LayoutInfo,
  children,
});
/** A custom card: a card container (outline, radius, padding 16, gap 8) of image + heading. */
const card = (id: string) => container(id, { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' }, [image(`${id}-img`), heading(`${id}-title`, 'Title')]);

/** Phone frame `F` at (0, 0) (vstack, padding 16, gap 12) with `children`. */
function wireframe(children: SceneNode[]): DesignDocument {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const id = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0, layout: defaultScreenLayout('phone') });
  const frame = doc.children.find((n) => n.id === id) as ScreenNode;
  frame.id = 'F';
  frame.children = children;
  return materializeDocument(doc);
}

const node = (doc: DesignDocument, id: string) => findNode(doc, id) as GroupNode;
const kids = (doc: DesignDocument, id: string) => node(doc, id).children.map((c) => c.id);

beforeEach(() => {
  s().load(createDocument());
  ed().setSelection([]);
});

// ---------- R2: containers as library elements ----------

describe('empty containers', () => {
  it('take a minimum size so they can be seen and targeted', () => {
    const doc = wireframe([container('v', { kind: 'vstack' }), container('h', { kind: 'hstack', padding: 50 })]);
    expect(node(doc, 'v').layout!.size).toEqual({ width: 390 - 32, height: EMPTY_CONTAINER.height });
    // padding bigger than the minimum: the padding wins
    expect(node(doc, 'h').layout!.size!.height).toBe(100);
  });

  it('are a drop target, also when nested (the innermost container under the pointer wins)', () => {
    const inner = container('inner', { kind: 'vstack' });
    const row = container('row', { kind: 'hstack', gap: 8 }, [box('a', 80), container('col', { kind: 'vstack', gap: 4 }, [inner])]);
    const doc = wireframe([row]);
    // World box of a node of the chain F → row → col → inner (stacks only translate).
    const chain = ['F', 'row', 'col', 'inner'];
    const at = (id: string) => {
      let x = 0;
      let y = 0;
      for (const p of chain.slice(0, chain.indexOf(id) + 1)) {
        x += node(doc, p).transform.x;
        y += node(doc, p).transform.y;
      }
      return { x, y, ...node(doc, id).layout!.size! };
    };
    const r = at('inner');
    expect(layoutDropTarget(doc, { x: r.x + 10, y: r.y + 10 })).toEqual({ containerId: 'inner', index: 0 });
    const c = at('col');
    expect(layoutDropTarget(doc, { x: c.x + 10, y: c.y + c.height - 1 })?.containerId).toBe('col');
    expect(layoutDropTarget(doc, { x: 18, y: r.y + 10 })?.containerId).toBe('row'); // over the instance `a`: its stack
  });

  it('the placeholder is canvas only: not in the SVG export nor in the export for AI', async () => {
    const doc = wireframe([container('v', { kind: 'vstack' }), heading('h', 'Hello')]);
    const { svg } = await exportSvg(doc, { scope: 'screen', screenId: 'F', outlineText: false });
    expect(svg).not.toContain('Drop elements here');
    expect(svg).not.toContain('stroke-dasharray');
    const md = aiMarkdown(doc).screens[0].markdown;
    expect(md).not.toMatch(/Drop elements|Vertical stack/);
    expect(md).toContain('Hello');
  });
});

describe('inserting containers from the library', () => {
  it('a click inserts an empty preset into the selected stack and selects it; the next one goes inside', () => {
    s().load(wireframe([box('a', 40)]));
    ed().setSelection(['F']);
    const card1 = insertContainer('card')!;
    expect(ed().selection).toEqual([card1]);
    expect(kids(s().doc, 'F')).toEqual(['a', card1]);
    expect(node(s().doc, card1).layout).toMatchObject({ kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' });
    const row = insertContainer('hstack')!;
    expect(kids(s().doc, card1)).toEqual([row]);
    expect(node(s().doc, row).layout!.size!.height).toBe(EMPTY_CONTAINER.height);
  });

  it('a drop goes into the innermost stack at that point', () => {
    s().load(wireframe([box('a', 40), container('v', { kind: 'vstack', padding: 8 }, [box('b', 40)])]));
    const v = node(s().doc, 'v');
    const id = insertContainer('grid', { x: v.transform.x + 20, y: v.transform.y + 2 })!;
    expect(kids(s().doc, 'v')).toEqual([id, 'b']);
    expect(node(s().doc, id).layout).toMatchObject({ kind: 'grid', columns: 2 });
  });

  it('the Layout presets are vertical, horizontal, grid and card container', () => {
    expect(CONTAINER_PRESETS.map((p) => p.label)).toEqual(['Vertical stack', 'Horizontal stack', 'Grid', 'Card container']);
    expect(newContainer(CONTAINER_PRESETS[0], { x: 1, y: 2 }).children).toEqual([]);
  });

  it('Change to horizontal / vertical / grid keeps children, style and repeat', () => {
    s().load(wireframe([container('v', { kind: 'vstack', gap: 6, style: 'filled', repeat: { count: 2 } }, [box('a', 40)])]));
    ed().setSelection(['v']);
    changeKind('hstack');
    expect(node(s().doc, 'v').layout).toMatchObject({ kind: 'hstack', gap: 6, style: 'filled', repeat: { count: 2 } });
    expect(kids(s().doc, 'v')).toEqual(['a', `${copyPrefix('a', 2)}a`]);
    changeKind('grid');
    expect(node(s().doc, 'v').layout).toMatchObject({ kind: 'grid', columns: 2 });
  });
});

// ---------- R3: container appearance ----------

describe('container style', () => {
  it('background: outline / filled / both, radius from the tokens; none draws nothing', () => {
    const doc = wireframe([
      container('o', { kind: 'vstack', style: 'outline', radius: 'small' }, [box('a', 40)]),
      container('f', { kind: 'vstack', style: 'filled', radius: 'large' }, [box('b', 40)]),
      container('of', { kind: 'vstack', style: 'outline-filled' }, [box('c', 40)]),
      container('n', { kind: 'vstack' }, [box('d', 40)]),
    ]);
    expect(containerBackground(node(doc, 'o'))).toMatchObject({ stroke: WF_CONTAINER.stroke, fill: null, radius: WF_CONTAINER.radius.small, width: 358, height: 40 });
    expect(containerBackground(node(doc, 'f'))).toMatchObject({ stroke: null, fill: WF_CONTAINER.fill, radius: WF_CONTAINER.radius.large });
    expect(containerBackground(node(doc, 'of'))).toMatchObject({ stroke: WF_CONTAINER.stroke, fill: WF_CONTAINER.fill, radius: 0 });
    expect(containerBackground(node(doc, 'n'))).toBeNull();
  });

  it('is exported (SVG) under the children; bounds and hit test use the container box', async () => {
    const doc = wireframe([card('c')]);
    const { svg } = await exportSvg(doc, { scope: 'screen', screenId: 'F', outlineText: false });
    expect(svg).toContain(`stroke="${WF_CONTAINER.stroke}"`);
    expect(svg).toContain('rx="7.5"');
    const c = node(doc, 'c');
    // padding area of the card (no child there): the card is hit
    expect(hitTest(doc, { x: c.transform.x + 4, y: c.transform.y + 4 })).toBe('c');
  });

  it('containers stay non-paintable: the style is their own prop', () => {
    s().load(wireframe([container('v', { kind: 'vstack' }, [box('a', 40)])]));
    setContainerStyle(['v'], 'outline-filled');
    expect(node(s().doc, 'v').layout!.style).toBe('outline-filled');
    setContainerStyle(['v'], 'none');
    expect('style' in node(s().doc, 'v').layout!).toBe(false);
    s().undo();
    expect(node(s().doc, 'v').layout!.style).toBe('outline-filled');
  });

  it('the export for AI names a styled container', () => {
    const doc = wireframe([card('c'), container('f', { kind: 'hstack', style: 'filled' }, [box('x', 20), box('y', 20)])]);
    const md = aiMarkdown(doc).screens[0].markdown;
    expect(md).toContain('- Card container (outlined)');
    expect(md).toMatch(/- Card container \(outlined\)\n {2}- Image/);
    expect(md).toContain('- Horizontal stack (filled)');
  });
});

// ---------- R4: repeat ----------

const listDoc = (count = 3) => wireframe([container('list', { kind: 'vstack', gap: 12, repeat: { count } }, [card('t')])]);

describe('repeat', () => {
  it('generates count − 1 copies after the template, with stable ids, placed with the gap', () => {
    const doc = listDoc(3);
    const ids = kids(doc, 'list');
    expect(ids).toEqual(['t', `${copyPrefix('t', 2)}t`, `${copyPrefix('t', 3)}t`]);
    const [t, c2, c3] = node(doc, 'list').children as GroupNode[];
    expect(c2.repeatCopy).toEqual({ template: 't', index: 2 });
    expect(c3.repeatCopy).toEqual({ template: 't', index: 3 });
    expect(c2.children.map((c) => c.id)).toEqual([`${copyPrefix('t', 2)}t-img`, `${copyPrefix('t', 2)}t-title`]);
    const h = t.layout!.size!.height;
    expect([t.transform.y, c2.transform.y, c3.transform.y]).toEqual([0, h + 12, 2 * (h + 12)]);
    expect(c2.layout!.size).toEqual(t.layout!.size);
    // generated children of instances inside a copy follow the instance id
    expect((c2.children[1] as GroupNode).children[0].id).toBe(`${copyPrefix('t', 2)}t-title~0`);
  });

  it('is idempotent: running the pipeline again changes nothing', () => {
    const doc = listDoc(4);
    expect(runWireframePipeline(doc, null, 'load', { patches: false })).toBeNull();
    expect(repeatChildren(node(doc, 'list'))).toBeNull();
  });

  it('editing the template updates every copy, in the same undo step', () => {
    s().load(listDoc(3));
    const before = s().doc;
    s().updateNodes(['t-title'], (n) => {
      if (n.type === 'group' && n.component) n.component.props.text = 'Changed';
    });
    const list = node(s().doc, 'list');
    for (const c of list.children) {
      const title = (c as GroupNode).children[1] as ComponentNode;
      expect(title.component.props.text).toBe('Changed');
    }
    s().undo();
    expect(s().doc).toEqual(before);
  });

  it('count changes add or remove copies; off keeps only the template', () => {
    s().load(listDoc(3));
    setRepeat(['list'], 5);
    expect(kids(s().doc, 'list')).toHaveLength(5);
    setRepeat(['list'], 2);
    expect(kids(s().doc, 'list')).toEqual(['t', `${copyPrefix('t', 2)}t`]);
    setRepeat(['list'], null);
    expect(kids(s().doc, 'list')).toEqual(['t']);
    s().undo();
    expect(kids(s().doc, 'list')).toHaveLength(2);
  });

  it('works for horizontal stacks and grids, and nested repeats', () => {
    const chips = container('chips', { kind: 'hstack', gap: 8, repeat: { count: 3 } }, [box('chip', 32)]);
    const gallery = container('gal', { kind: 'grid', columns: 2, gap: 10, repeat: { count: 4 } }, [image('img')]);
    // a repeated card whose content holds a repeated row
    const inner = container('rows', { kind: 'vstack', gap: 4, repeat: { count: 2 } }, [box('row', 20)]);
    const outer = container('outer', { kind: 'vstack', gap: 12, repeat: { count: 3 } }, [container('item', { kind: 'vstack', padding: 8, style: 'outline' }, [inner])]);
    const doc = wireframe([chips, gallery, outer]);
    const ch = node(doc, 'chips').children;
    expect(ch).toHaveLength(3);
    expect(ch[1].transform.x).toBeGreaterThan(ch[0].transform.x);
    expect(ch[1].transform.y).toBe(ch[0].transform.y);
    const g = node(doc, 'gal').children;
    expect(g).toHaveLength(4);
    expect(g[2].transform.y).toBeGreaterThan(g[0].transform.y);
    expect(g[1].transform.x).toBeGreaterThan(g[0].transform.x);
    expect(node(doc, 'outer').children).toHaveLength(3);
    for (const item of node(doc, 'outer').children as GroupNode[]) expect((item.children[0] as GroupNode).children).toHaveLength(2);
    expect(runWireframePipeline(doc, null, 'load', { patches: false })).toBeNull();
  });

  it('clicking a copy selects the template; marquee and drop targets skip copies', () => {
    const doc = listDoc(3);
    const c3 = node(doc, 'list').children[2];
    const list = node(doc, 'list');
    const p = { x: list.transform.x + c3.transform.x + 5, y: list.transform.y + c3.transform.y + 5 };
    expect(hitTest(doc, p, { deep: true })).toBe('t');
    expect(hitTest(doc, p)).toBe('list');
    const all = nodesInRect(doc, { x: 0, y: 0, width: 390, height: 2000 }, { deep: true });
    expect(all.some((id) => id.includes('~r'))).toBe(false);
    // dropping into a repeating stack never goes before the template (it would become the template)
    const boxes = wireframe([container('rows', { kind: 'vstack', repeat: { count: 3 } }, [box('row', 40)])]);
    const rows = node(boxes, 'rows');
    expect(layoutDropTarget(boxes, { x: rows.transform.x + 5, y: rows.transform.y + 2 })).toEqual({ containerId: 'rows', index: 1 });
  });

  it('deleting the template removes its copies; another child becomes the template', () => {
    s().load(wireframe([container('list', { kind: 'vstack', repeat: { count: 3 } }, [box('a', 20), box('b', 20)])]));
    expect(kids(s().doc, 'list')).toEqual(['a', `${copyPrefix('a', 2)}a`, `${copyPrefix('a', 3)}a`, 'b']);
    s().deleteNodes(['a']);
    expect(kids(s().doc, 'list')).toEqual(['b', `${copyPrefix('b', 2)}b`, `${copyPrefix('b', 3)}b`]);
  });

  it('Remove stack turns the copies into real objects; duplicates regenerate their copies', () => {
    s().load(listDoc(2));
    s().apply((d) => void unwrapLayout(d, 'list'));
    const f = node(s().doc, 'F').children;
    expect(f).toHaveLength(2);
    expect(f.every((n) => !n.repeatCopy && !n.id.includes('~r'))).toBe(true);

    s().load(listDoc(2));
    const [dup] = s().duplicate(['list']);
    const d = node(s().doc, dup);
    expect(d.children).toHaveLength(2);
    expect(d.children[1].repeatCopy?.template).toBe(d.children[0].id);
  });

  it('the export for AI says "List of N × (…)" once', () => {
    const doc = wireframe([
      container('list', { kind: 'vstack', gap: 12, repeat: { count: 6 } }, [card('t')]),
      container('chips', { kind: 'hstack', gap: 8, repeat: { count: 4 } }, [heading('chip', 'Tag')]),
    ]);
    const md = aiMarkdown(doc).screens[0].markdown;
    expect(md).toContain('- List of 6 × (Card container (outlined)), each:');
    expect(md).toMatch(/List of 6 × \(Card container \(outlined\)\), each:\n {2}- Image/);
    expect(md).toContain('- Horizontal list of 4 × (Subheading "Tag")');
    expect(md.match(/Title/g)).toHaveLength(1);
  });

  it('stays fast: 10 screens × 100 components with repeated lists', () => {
    const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
    for (let i = 0; i < 10; i++) {
      const id = addScreen(doc, { platform: 'phone', x: i * 500, y: 0 });
      const f = doc.children.find((c) => c.id === id) as ScreenNode;
      f.children = [
        ...Array.from({ length: 60 }, (_, j) => box(`c${i}-${j}`, 40)),
        container(`l${i}`, { kind: 'vstack', gap: 12, repeat: { count: 10 } }, [card(`t${i}`)]),
      ];
    }
    const t0 = performance.now();
    s().load(doc);
    const load = performance.now() - t0;
    const times: number[] = [];
    for (let k = 0; k < 20; k++) {
      const t = performance.now();
      s().updateNodes(['t3-title'], (n) => {
        if (n.type === 'group' && n.component) n.component.props.text = `T${k}`;
      });
      times.push(performance.now() - t);
    }
    expect(((node(s().doc, 'l3').children[9] as GroupNode).children[1] as ComponentNode).component.props.text).toBe('T19');
    const median = times.sort((a, b) => a - b)[10];
    // ~5 ms locally; generous for a loaded machine running the suite in parallel.
    expect(median).toBeLessThan(80);
    expect(load).toBeLessThan(5000);
  });
});

// ---------- file format ----------

describe('file format', () => {
  it('round-trips style, radius, repeat and copies', () => {
    const doc = listDoc(3);
    const back = materializeDocument(parseProject(serializeProject(doc)));
    expect(node(back, 'list').layout!.repeat).toEqual({ count: 3 });
    expect(node(back, 't').layout).toMatchObject({ style: 'outline', radius: 'small' });
    expect(kids(back, 'list')).toEqual(kids(doc, 'list'));
  });

  const withLayout = (layout: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    format: 'designer',
    schemaVersion: 1,
    wireframe: { screens: [] },
    artboard: { width: 10, height: 10 },
    children: [{ type: 'group', id: 'g', layout: { kind: 'vstack', ...layout }, children: [{ type: 'group', id: 'c', children: [], ...extra }] }],
  });

  it('validates with the JSON path in the error', () => {
    expect(() => validateDocument(withLayout({ style: 'red' }))).toThrow(/children\[0\]\.layout\.style/);
    expect(() => validateDocument(withLayout({ radius: 3 }))).toThrow(/layout\.radius/);
    expect(() => validateDocument(withLayout({ repeat: { count: 0 } }))).toThrow(/layout\.repeat\.count/);
    expect(() => validateDocument(withLayout({ repeat: { count: 2.5 } }))).toThrow(/whole number/);
    expect(() => validateDocument(withLayout({}, { repeatCopy: { template: 'x', index: 1 } }))).toThrow(/repeatCopy\.index/);
    const doc = validateDocument(withLayout({ style: 'none', radius: 'none', repeat: { count: 2 } }, { repeatCopy: { template: 'x', index: 2 } }));
    expect((doc.children[0] as GroupNode).layout).toEqual({ kind: 'vstack', gap: 0, padding: 0, align: 'stretch', repeat: { count: 2 } });
    expect((doc.children[0] as GroupNode).children[0].repeatCopy).toEqual({ template: 'x', index: 2 });
  });

  it('non-wireframe files drop repeat copies with a warning', () => {
    const warnings: string[] = [];
    const raw = withLayout({});
    delete (raw as Partial<typeof raw>).wireframe;
    (raw.children[0] as Record<string, unknown>).layout = undefined;
    (raw.children[0].children[0] as Record<string, unknown>).repeatCopy = { template: 'x', index: 2 };
    const doc = validateDocument(raw, { warnings });
    expect((doc.children[0] as GroupNode).children[0].repeatCopy).toBeUndefined();
    expect(warnings.join()).toMatch(/repeatCopy/);
  });
});
