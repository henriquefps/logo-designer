// R1 "Sizes that follow" (docs/wireframe-mode.md): every component either follows the size it is given
// or says it can't. Through the whole pipeline: fixed height, fill, the user dragging / typing H.
import { beforeEach, describe, expect, it } from 'vitest';
import { bakeScale, boundsIn, createDocument, fromTransform, createGroup, findNode, nodeAxes, selectionAxes, type ComponentNode, type DesignDocument, type GroupNode, type LayoutItemInfo, type RectNode, type SceneNode, type ScreenNode } from '@/model';
import { handleAllowed } from '@/canvas/selectionFrame';
import { useDocStore } from '@/store/useDocStore';
import { getComponent } from '../library/registry';
import { newInstance } from '../instances';
import { defaultScreenLayout } from '../layout';
import { materializeDocument } from '../pipeline';
import { addScreen } from '../screens';
import { containerPreset, newContainer } from '../containers';

const s = () => useDocStore.getState();
const inst = (id: string, kind: string, props: Record<string, unknown> = {}, item?: LayoutItemInfo): ComponentNode => ({
  ...newInstance(getComponent(kind)!, { x: 0, y: 0 }, getComponent(kind)!.sizing.width === 'fill' ? 342 : getComponent(kind)!.defaultSize.width, { ...Object.fromEntries(Object.entries(getComponent(kind)!.props as Record<string, { default: unknown }>).map(([k, v]) => [k, v.default])), ...props }),
  id,
  ...(item ? { layoutItem: item } : {}),
});

function wireframe(children: SceneNode[], stack = true): DesignDocument {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const id = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0, layout: stack ? defaultScreenLayout('phone') : null });
  const frame = doc.children.find((c) => c.id === id) as ScreenNode;
  frame.id = 'F';
  frame.children = children;
  return materializeDocument(doc);
}

const n = <T extends SceneNode = ComponentNode>(id: string) => findNode(s().doc, id) as T;
const size = (id: string) => n(id).component.size!;
/** The box drawn by the card's outline / surface: what the user sees. */
const outlineH = (id: string) => {
  const o = n(id).children.find((c) => c.name === 'Outline') as RectNode;
  return o.height;
};
const resizeTo = (id: string, w: number | null, h: number | null) =>
  s().replaceNodes([bakeScale({ ...structuredClone(n(id)), transform: { ...n(id).transform, scaleX: w ? w / size(id).width : 1, scaleY: h ? h / size(id).height : 1 } })]);

beforeEach(() => s().load(createDocument()));

describe('resize gesture: the result depends on the total change, not the last frame', () => {
  /** Frames computed from the snapshot, like the selection handles do (each re-applies the snapshot's layoutItem). */
  const gesture = (id: string, frames: [number | null, number | null][]) => {
    const snap = structuredClone(n(id));
    s().beginTransaction('Resize');
    for (const [w, h] of frames) {
      s().replaceNodes([bakeScale({ ...structuredClone(snap), transform: { ...snap.transform, scaleX: w ? w / snap.component.size!.width : 1, scaleY: h ? h / snap.component.size!.height : 1 } })]);
    }
    s().commitTransaction();
  };

  it('a last frame that does not change the height keeps the height fixed', () => {
    s().load(wireframe([inst('c', 'card')]));
    const natural = size('c').height;
    const w = size('c').width;
    gesture('c', [[null, natural + 40], [null, natural + 120], [null, natural + 120]]);
    expect(n('c').layoutItem?.height).toBe(natural + 120);
    expect(size('c').height).toBe(natural + 120);
    expect(outlineH('c')).toBe(natural + 120);
    expect(size('c').width).toBe(w);
  });

  it('a gesture that ends where it started changes nothing', () => {
    s().load(wireframe([inst('c', 'card')]));
    const natural = size('c').height;
    gesture('c', [[null, natural + 60], [null, natural]]);
    expect(n('c').layoutItem?.height).toBeUndefined();
  });

  it('width: an x-only tail keeps the fixed width', () => {
    s().load(wireframe([inst('c', 'card')]));
    const w = size('c').width;
    gesture('c', [[w - 50, null], [w - 100, null], [w - 100, null]]);
    expect(n('c').layoutItem?.width).toBe(w - 100);
  });

  it('a container (R2) keeps its fixed height too', () => {
    const box = { ...createGroup({ name: 'box' }), id: 'box', layout: { kind: 'vstack', gap: 0, padding: 8, align: 'stretch' }, children: [inst('h', 'heading')] } as GroupNode;
    s().load(wireframe([box]));
    const was = (n<GroupNode>('box').layout!.size ?? { width: 0, height: 0 }).height;
    const snap = structuredClone(n<GroupNode>('box'));
    s().beginTransaction('Resize');
    for (const h of [was + 30, was + 90, was + 90]) {
      s().replaceNodes([bakeScale({ ...structuredClone(snap), transform: { ...snap.transform, scaleY: h / was } })]);
    }
    s().commitTransaction();
    expect(n<GroupNode>('box').layoutItem?.height).toBe(was + 90);
  });
});

describe('R1: the card follows its height (the reported bug)', () => {
  it('a fixed layout height reaches build(): the border is as tall as the box', () => {
    s().load(wireframe([inst('c', 'card', {}, { height: 300 })]));
    expect(size('c').height).toBe(300);
    expect(outlineH('c')).toBe(300);
  });

  it('dragging / typing H inside a stack: the box and the border change together', () => {
    s().load(wireframe([inst('c', 'card')]));
    const natural = size('c').height;
    expect(outlineH('c')).toBe(natural);
    resizeTo('c', null, natural + 150);
    expect(n('c').layoutItem?.height).toBe(natural + 150);
    expect(size('c').height).toBe(natural + 150);
    expect(outlineH('c')).toBe(natural + 150);
  });

  it('dragging H on a free instance (a screen without a stack) too', () => {
    s().load(wireframe([inst('c', 'card')], false));
    const natural = size('c').height;
    resizeTo('c', null, natural + 100);
    expect(size('c').height).toBe(natural + 100);
    expect(outlineH('c')).toBe(natural + 100);
    // Editing a prop afterwards keeps the height the user chose.
    s().updateNodes(['c'], (g) => void ((g as ComponentNode).component.props = { ...(g as ComponentNode).component.props, title: 'Another title' }));
    expect(outlineH('c')).toBe(natural + 100);
  });

  it('fill in a stack: the card takes the leftover height', () => {
    s().load(wireframe([inst('c', 'card', {}, { height: 'fill' })]));
    expect(size('c').height).toBeGreaterThan(500);
    expect(outlineH('c')).toBe(size('c').height);
  });

  it('an image can be made shorter than its ratio, also inside a card container (found recording the overview)', () => {
    // Dragging an image's bottom handle up stored the height, but the layout kept the ratio's height: a silent no-op.
    s().load(wireframe([inst('i', 'image', { ratio: '16:9' })]));
    const natural = size('i').height;
    resizeTo('i', null, 100);
    expect(n('i').layoutItem?.height).toBe(100);
    expect(size('i').height).toBe(100);
    const card = { ...newContainer(containerPreset('card')!, { x: 0, y: 0 }, 342), id: 'card' } as GroupNode;
    card.children = [inst('j', 'image', { ratio: '16:9' })];
    s().load(wireframe([card]));
    resizeTo('j', null, 90);
    expect(size('j').height).toBe(90);
    expect(size('j').height).toBeLessThan(natural);
    // Never thinner than a strip (plus the caption).
    resizeTo('j', null, 2);
    expect(size('j').height).toBe(24);
  });

  it('resizing a child does not fix the height of the card and stack around it (found recording the overview)', () => {
    // The resize step took the card's and the stack's reflowed boxes for a resize by the user and fixed them at their
    // old height: the card stayed tall around a shorter image, and a repeated list kept every copy that tall.
    const card = { ...newContainer(containerPreset('card')!, { x: 0, y: 0 }, 342), id: 'card' } as GroupNode;
    card.children = [inst('i', 'image', { ratio: '16:9' })];
    const stack = { ...newContainer(containerPreset('vstack')!, { x: 0, y: 0 }, 342), id: 'v' } as GroupNode;
    stack.children = [card];
    s().load(wireframe([stack]));
    const cardH = n<GroupNode>('card').layout!.size!.height;
    const snap = structuredClone(n('i'));
    s().beginTransaction('Resize');
    for (const h of [170, 140, 100]) s().replaceNodes([bakeScale({ ...structuredClone(snap), transform: { ...snap.transform, scaleY: h / snap.component.size!.height } })]);
    s().commitTransaction();
    expect(size('i').height).toBe(100);
    expect(n('i').layoutItem?.height).toBe(100);
    expect(n<GroupNode>('card').layoutItem?.height).toBeUndefined();
    expect(n<GroupNode>('v').layoutItem?.height).toBeUndefined();
    expect(n<GroupNode>('card').layout!.size!.height).toBeCloseTo(cardH - (snap.component.size!.height - 100), 0);
    // Resizing the card itself still fixes its height.
    s().replaceNodes([{ ...structuredClone(n<GroupNode>('card')), layout: { ...n<GroupNode>('card').layout!, size: { width: 342, height: 400 } } }]);
    expect(n<GroupNode>('card').layoutItem?.height).toBe(400);
  });

  it('a box shorter than the content never cuts it: the card keeps its natural height', () => {
    s().load(wireframe([inst('c', 'card')]));
    const natural = size('c').height;
    resizeTo('c', null, 10);
    expect(size('c').height).toBe(natural);
    expect(outlineH('c')).toBe(natural);
  });
});

describe('axes a component cannot be sized in', () => {
  it('are declared by the definition (width true / height false by default)', () => {
    expect(nodeAxes(inst('a', 'card'))).toEqual({ width: true, height: true });
    expect(nodeAxes(inst('a', 'button'))).toEqual({ width: true, height: false });
    expect(nodeAxes(inst('a', 'avatar'))).toEqual({ width: false, height: false });
    expect(nodeAxes(inst('a', 'list-row'))).toEqual({ width: true, height: false });
    expect(nodeAxes(createGroup())).toEqual({ width: true, height: true });
    expect(nodeAxes({ ...createGroup(), note: { text: '' } } as unknown as SceneNode)).toEqual({ width: false, height: false });
  });

  it('a height set for one is ignored by the layout and by resizing', () => {
    s().load(wireframe([inst('b', 'button', {}, { height: 200 }), inst('r', 'list-row')]));
    expect(size('b').height).toBe(44);
    const h = size('r').height;
    resizeTo('r', 300, h * 3);
    expect(size('r').height).toBe(h);
    expect(size('r').width).toBe(300);
    expect(n('r').layoutItem?.height).toBeUndefined();
  });

  it('typing a width for a fixed-width component changes nothing', () => {
    s().load(wireframe([inst('a', 'avatar')], false));
    const before = size('a');
    resizeTo('a', before.width * 2, before.height * 2);
    expect(size('a')).toEqual(before);
  });

  it('the selection offers only the handles of the axes that can change', () => {
    s().load(wireframe([inst('r', 'list-row'), inst('c', 'card'), inst('a', 'avatar')]));
    const d = s().doc;
    // Handle order: tl, t, tr, r, br, b, bl, l.
    const open = (ids: string[]) => [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => handleAllowed(d, ids, i));
    expect(open(['r'])).toEqual([3, 7]); // sides only: height follows the content
    expect(open(['c'])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(open(['a'])).toEqual([]);
    expect(open(['c', 'r'])).toEqual([3, 7]);
    expect(selectionAxes(d, ['c', 'r'])).toEqual({ width: true, height: false });
  });
});

describe('surfaces fill a taller box', () => {
  const build = (kind: string, props: Record<string, unknown>, height?: number, width = 342) => {
    const def = getComponent(kind)!;
    const p = Object.fromEntries(Object.entries(def.props as Record<string, { default: unknown }>).map(([k, v]) => [k, k in props ? props[k] : v.default]));
    return def.build(p as never, height === undefined ? { width } : { width, height });
  };
  const rect = (r: ReturnType<typeof build>, name: string) => r.children.find((c) => c.name === name) as RectNode;
  const top = (r: ReturnType<typeof build>, name: string) => r.children.find((c) => c.name === name)!.transform.y;

  it('card: border and background take the box; the title stays on top', () => {
    const a = build('card', {});
    const b = build('card', {}, a.height + 100);
    expect(b.height).toBe(a.height + 100);
    expect(rect(b, 'Outline').height).toBe(b.height);
    expect(rect(b, 'Surface').height).toBe(b.height);
    expect(top(b, 'Title')).toBe(top(a, 'Title'));
  });

  it('empty state: the content is centred in the taller box', () => {
    const a = build('empty-state', {});
    const b = build('empty-state', {}, a.height + 200);
    expect(b.height).toBe(a.height + 200);
    const content = b.children[0] as GroupNode;
    expect(content.name).toBe('Content');
    expect(content.transform.y).toBe(100);
    expect(build('empty-state', {}, a.height).children.map((c) => c.name)).toEqual(a.children.map((c) => c.name));
  });

  it('image: fills its box whatever the ratio (the ratio is what it hugs to); the caption stays under it', () => {
    const a = build('image', { ratio: '16:9' });
    const b = build('image', { ratio: '16:9' }, 400);
    expect(a.height).toBe(192);
    expect(b.height).toBe(400);
    const c = build('image', { ratio: '1:1', caption: 'Cover' }, 400);
    expect(c.height).toBeLessThanOrEqual(400);
    expect(c.height).toBeGreaterThan(370);
  });

  it('text area: the field takes the extra height, the label and helper stay put', () => {
    const a = build('text-area', { helper: 'Help' });
    const b = build('text-area', { helper: 'Help' }, a.height + 80);
    expect(b.height).toBe(a.height + 80);
    expect(rect(b, 'Field').height).toBe(rect(a, 'Field').height + 80);
  });

  it('dialog and modal: the surface grows and the actions sit on the bottom edge', () => {
    for (const kind of ['dialog', 'modal'] as const) {
      const a = build(kind, {});
      const b = build(kind, {}, a.height + 90);
      expect(b.height).toBe(a.height + 90);
      expect(rect(b, kind === 'dialog' ? 'Card' : 'Window').height).toBe(b.height);
      const bottoms = (r: ReturnType<typeof build>) => r.children.filter((c) => /action|Button/i.test(c.name ?? '')).map((c) => boundsIn(c, fromTransform(c.transform))!.y + boundsIn(c, fromTransform(c.transform))!.height);
      expect(bottoms(b).length).toBeGreaterThan(0);
      expect(Math.max(...bottoms(b))).toBeCloseTo(Math.max(...bottoms(a)) + 90, 0);
    }
  });

  it('bottom sheet and sidebar: taller surface, content on top', () => {
    const a = build('bottom-sheet', {});
    const b = build('bottom-sheet', {}, a.height + 120);
    expect(b.height).toBe(a.height + 120);
    expect(rect(b, 'Sheet').height).toBe(b.height);
    const sa = build('sidebar-nav', {});
    expect(build('sidebar-nav', {}, sa.height + 100).height).toBe(sa.height + 100);
  });

  it('data table: the extra room is empty rows', () => {
    const a = build('data-table', { rows: 3 });
    const b = build('data-table', { rows: 3 }, a.height + 3 * 52 + 10);
    expect(b.height).toBe(a.height + 3 * 52 + 10);
    expect(rect(b, 'Table').height).toBe(b.height);
    const rows = b.children.filter((c) => /^Row \d/.test(c.name ?? ''));
    expect(rows.length).toBe(6);
    expect(rows.filter((r) => r.name!.endsWith('(empty)')).length).toBe(3);
  });

  it('cards grid: rows share the height, cards get taller', () => {
    const a = build('cards-grid', { rows: 2 }, undefined, 900);
    const b = build('cards-grid', { rows: 2 }, a.height + 100, 900);
    expect(b.height).toBe(a.height + 100);
    expect(rect(b, 'Card').height).toBeGreaterThan(rect(a, 'Card').height);
  });

  it('image grid: rows share the height', () => {
    const a = build('image-grid', {});
    expect(build('image-grid', {}, a.height + 100).height).toBe(a.height + 100);
  });

  it('paragraph: more bars in a taller box', () => {
    const a = build('paragraph', { lines: 3 });
    const b = build('paragraph', { lines: 3 }, a.height * 2 + 5);
    expect(b.height).toBeGreaterThan(a.height);
    expect(b.height).toBeLessThanOrEqual(a.height * 2 + 5);
  });
});
