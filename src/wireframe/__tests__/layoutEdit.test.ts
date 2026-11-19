import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createGroup, createRect, findNode, getParent, worldBounds, type ComponentNode, type DesignDocument, type GroupNode, type LayoutItemInfo, type SceneNode, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { defaultScreenLayout } from '../layout';
import { startLayoutDrag } from '../layoutDrag';
import { canWrap, dropIndicator, insertIntoLayout, layoutDropTarget, moveIntoLayout, unwrapLayout, wrapInLayout } from '../layoutEdit';
import { materializeDocument } from '../pipeline';
import { addScreen } from '../screens';

const box = (id: string, height: number, item?: LayoutItemInfo): ComponentNode => ({
  ...createGroup({ name: id }),
  id,
  component: { kind: 'placeholder', props: { label: id, height } },
  ...(item ? { layoutItem: item } : {}),
});

/** Phone frame `F` at (100, 50) with a vertical stack (padding 16, gap 12) of 100-tall boxes a, b, c (y = 16, 128, 240). */
function wireframe(extra: SceneNode[] = [], children: SceneNode[] = [box('a', 100), box('b', 100), box('c', 100)]): DesignDocument {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const id = addScreen(doc, { platform: 'phone', name: 'Home', x: 100, y: 50, layout: defaultScreenLayout('phone') });
  const frame = doc.children.find((n) => n.id === id) as ScreenNode;
  frame.id = 'F';
  frame.children = children;
  doc.children.push(...extra);
  return materializeDocument(doc);
}

const s = () => useDocStore.getState();
const order = (doc: DesignDocument, id = 'F') => (findNode(doc, id) as GroupNode).children.map((c) => c.id);
const pos = (doc: DesignDocument, id: string) => [findNode(doc, id)!.transform.x, findNode(doc, id)!.transform.y];

beforeEach(() => s().load(createDocument()));

describe('layoutDropTarget', () => {
  it('finds the stack under a point and the index a drop takes', () => {
    const doc = wireframe();
    // world y of a = 50 + 16 = 66 .. 166; b 178 .. 278; c 290 .. 390
    expect(layoutDropTarget(doc, { x: 200, y: 70 })).toEqual({ containerId: 'F', index: 0 });
    expect(layoutDropTarget(doc, { x: 200, y: 230 })).toEqual({ containerId: 'F', index: 2 });
    expect(layoutDropTarget(doc, { x: 200, y: 800 })).toEqual({ containerId: 'F', index: 3 });
    // counted without the dragged node
    expect(layoutDropTarget(doc, { x: 200, y: 800 }, { exclude: ['a'] })).toEqual({ containerId: 'F', index: 2 });
  });

  it('nothing on the canvas or on a free screen', () => {
    const doc = wireframe();
    expect(layoutDropTarget(doc, { x: -500, y: 0 })).toBeNull();
    const free = createDocument({ name: 'W', wireframe: { screens: [] } });
    addScreen(free, { platform: 'phone', x: 0, y: 0, layout: null });
    expect(layoutDropTarget(materializeDocument(free), { x: 10, y: 10 })).toBeNull();
  });

  it('the deepest stack wins; a horizontal stack indexes by x', () => {
    const row: GroupNode = { ...createGroup({ name: 'row' }), id: 'row', layout: { kind: 'hstack', gap: 10, padding: 0, align: 'start' }, children: [box('x', 40, { width: 100 }), box('y', 40, { width: 100 })] };
    const doc = wireframe([], [box('a', 100), row]);
    // row at frame (16, 128) → world (116, 178)
    expect(layoutDropTarget(doc, { x: 120, y: 190 })).toEqual({ containerId: 'row', index: 0 });
    expect(layoutDropTarget(doc, { x: 200, y: 190 })).toEqual({ containerId: 'row', index: 1 });
    expect(layoutDropTarget(doc, { x: 400, y: 190 })).toEqual({ containerId: 'row', index: 2 });
    // component instances are never targets: inside `a` the frame is
    expect(layoutDropTarget(doc, { x: 200, y: 80 })).toEqual({ containerId: 'F', index: 0 });
  });

  it('dropIndicator: a line in the gap between two rows, across the inner width', () => {
    const doc = wireframe();
    const line = dropIndicator(doc, { containerId: 'F', index: 1 });
    expect(line).toEqual({ a: { x: 116, y: 50 + 128 - 6 }, b: { x: 100 + 390 - 16, y: 50 + 128 - 6 } });
    expect(dropIndicator(doc, { containerId: 'F', index: 3 })?.a.y).toBe(50 + 340 + 6);
  });
});

describe('inserting and moving', () => {
  it('insertIntoLayout puts a node at an index; the layout places it', () => {
    s().load(wireframe());
    s().apply((d) => void insertIntoLayout(d, 'F', box('new', 50), 1));
    expect(order(s().doc)).toEqual(['a', 'new', 'b', 'c']);
    expect(pos(s().doc, 'new')).toEqual([16, 128]);
    expect(pos(s().doc, 'b')).toEqual([16, 190]);
    expect(insertIntoLayout(structuredClone(s().doc), 'a', box('x', 10))).toBe(false); // an instance is not a container
  });

  it('moveIntoLayout reorders within a stack', () => {
    s().load(wireframe());
    s().apply((d) => void moveIntoLayout(d, ['c'], { containerId: 'F', index: 0 }));
    expect(order(s().doc)).toEqual(['c', 'a', 'b']);
    expect(pos(s().doc, 'c')).toEqual([16, 16]);
  });
});

/** Simulates the select tool: drag `ids` by (dx, dy) to `point`, then drop. */
function drag(ids: string[], point: { x: number; y: number }, mod = false) {
  const store = s();
  store.beginTransaction('Move');
  const ld = startLayoutDrag(useDocStore.getState, ids);
  for (const id of ids) {
    const b = worldBounds(s().doc, id)!;
    const n = findNode(s().doc, id)!;
    s().updateNode(id, { transform: { x: n.transform.x + point.x - b.x, y: n.transform.y + point.y - b.y } });
  }
  ld?.move(point, mod);
  ld?.drop();
  s().commitTransaction();
}

describe('dragging (select tool)', () => {
  it('dragging a child inside its stack reorders it: one undo step', () => {
    s().load(wireframe());
    const steps = s().past.length;
    drag(['a'], { x: 200, y: 360 });
    expect(order(s().doc)).toEqual(['b', 'c', 'a']);
    expect(pos(s().doc, 'a')).toEqual([16, 240]);
    expect(s().past.length).toBe(steps + 1);
    s().undo();
    expect(order(s().doc)).toEqual(['a', 'b', 'c']);
    expect(pos(s().doc, 'a')).toEqual([16, 16]);
  });

  it('an object from the canvas dropped on a stack is inserted there', () => {
    const r = { ...createRect({ width: 50, height: 20, transform: { x: -300, y: 0 } }), id: 'r' };
    s().load(wireframe([r]));
    drag(['r'], { x: 200, y: 175 });
    expect(order(s().doc)).toEqual(['a', 'r', 'b', 'c']);
    expect(worldBounds(s().doc, 'r')).toMatchObject({ x: 116, y: 50 + 128 });
  });

  it('dropping with ⌘ / Ctrl makes a child free on the screen, where it was dropped', () => {
    s().load(wireframe());
    drag(['b'], { x: 300, y: 600 }, true);
    const b = findNode(s().doc, 'b')!;
    expect(getParent(s().doc, 'b')?.id).toBe('F');
    expect(b.layoutItem?.position).toBe('free');
    expect(worldBounds(s().doc, 'b')).toMatchObject({ x: 300, y: 600 });
    expect(pos(s().doc, 'c')).toEqual([16, 128]); // the stack closed the gap
  });

  it('dragged off every stack (onto the canvas), a child leaves its stack and keeps its position', () => {
    s().load(wireframe());
    drag(['b'], { x: -400, y: 100 });
    expect(getParent(s().doc, 'b')).toBeNull();
    expect(worldBounds(s().doc, 'b')).toMatchObject({ x: -400, y: 100 });
    expect(order(s().doc)).toEqual(['a', 'c']);
  });

  it('free children move freely', () => {
    const fab = { ...box('fab', 56, { position: 'free', width: 56 }), transform: { x: 300, y: 700, rotation: 0, scaleX: 1, scaleY: 1 } };
    s().load(wireframe([], [box('a', 100), fab]));
    drag(['fab'], { x: 150, y: 400 });
    expect(findNode(s().doc, 'fab')!.layoutItem?.position).toBe('free');
    expect(worldBounds(s().doc, 'fab')).toMatchObject({ x: 150, y: 400 });
  });

  it('other documents never get a layout drag', () => {
    const doc = createDocument();
    doc.children.push({ ...createRect({ width: 1, height: 1 }), id: 'r' });
    s().load(doc);
    expect(startLayoutDrag(useDocStore.getState, ['r'])).toBeNull();
  });
});

describe('wrap and unwrap', () => {
  it('wraps siblings in a stack at their place, in visual order', () => {
    s().load(wireframe());
    let id: string | null = null;
    s().apply((d) => {
      id = wrapInLayout(d, ['c', 'b'], 'vstack');
    });
    expect(order(s().doc)).toEqual(['a', id!]);
    expect(order(s().doc, id!)).toEqual(['b', 'c']);
    const g = findNode(s().doc, id!) as GroupNode;
    expect(g.layout).toMatchObject({ kind: 'vstack', gap: 12, padding: 0 });
    expect(g.layout?.size).toEqual({ width: 358, height: 212 });
    expect(pos(s().doc, id!)).toEqual([16, 128]);
    s().undo();
    expect(order(s().doc)).toEqual(['a', 'b', 'c']);
  });

  it('a horizontal stack of the same rows puts them side by side', () => {
    s().load(wireframe());
    s().apply((d) => void wrapInLayout(d, ['a', 'b'], 'hstack'));
    const share = (358 - 8) / 2;
    expect((findNode(s().doc, 'b') as ComponentNode).component.size).toEqual({ width: share, height: 100 });
    expect(pos(s().doc, 'b')).toEqual([share + 8, 0]);
    expect(pos(s().doc, 'c')).toEqual([16, 128]);
  });

  it('unwrap puts the children back where they are; on a screen it frees the content', () => {
    s().load(wireframe());
    let id: string | null = null;
    s().apply((d) => {
      id = wrapInLayout(d, ['b', 'c'], 'hstack');
    });
    s().apply((d) => void unwrapLayout(d, id!));
    expect(order(s().doc)).toEqual(['a', 'b', 'c']);
    s().apply((d) => void unwrapLayout(d, 'F'));
    expect((findNode(s().doc, 'F') as GroupNode).layout).toBeUndefined();
    const before = pos(s().doc, 'c');
    s().updateNode('c', { transform: { x: before[0] + 50 } });
    expect(pos(s().doc, 'c')).toEqual([before[0] + 50, before[1]]);
  });

  it('a screen frame selected gets the layout itself; frames and mixed parents cannot be wrapped', () => {
    const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
    const f = addScreen(doc, { platform: 'phone', x: 0, y: 0, layout: null });
    s().load(doc);
    s().apply((d) => void wrapInLayout(d, [f], 'grid'));
    expect((findNode(s().doc, f) as GroupNode).layout).toMatchObject({ kind: 'grid', columns: 2 });
    expect(canWrap(s().doc, [f])).toBe(false);
  });

  it('wrapping objects on the canvas: the stack sits where they were and is as wide as they were', () => {
    const a = { ...createRect({ width: 100, height: 20, transform: { x: 1050, y: 1010 } }), id: 'ra' };
    const b = { ...createRect({ width: 60, height: 20, transform: { x: 1030, y: 1060 } }), id: 'rb' };
    const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
    doc.children.push(a, b);
    s().load(doc);
    let id: string | null = null;
    s().apply((d) => {
      id = wrapInLayout(d, ['ra', 'rb'], 'vstack');
    });
    expect(pos(s().doc, id!)).toEqual([1000, 1000]);
    expect((findNode(s().doc, id!) as GroupNode).layout?.size).toEqual({ width: 100, height: 52 });
    expect(worldBounds(s().doc, 'rb')).toMatchObject({ x: 1000, y: 1032 });
  });
});

describe('settling', () => {
  it('a stack child whose centre ends up off the frame stays in the stack when the drop lands on it', () => {
    s().load(wireframe());
    // grab `a` near its right edge and drop with the pointer just inside the frame: its centre is outside
    s().beginTransaction('Move');
    const ld = startLayoutDrag(useDocStore.getState, ['a']);
    s().updateNode('a', { transform: { x: 16 + 330, y: 16 + 250 } });
    ld?.move({ x: 100 + 380, y: 50 + 300 }, false);
    ld?.drop();
    s().commitTransaction();
    expect(getParent(s().doc, 'a')?.id).toBe('F');
    expect(order(s().doc)).toEqual(['b', 'c', 'a']);
  });

  it('a nudge does not move a stack child (the layout owns its position)', () => {
    s().load(wireframe());
    s().updateNode('b', { transform: { x: 500 } });
    expect(pos(s().doc, 'b')).toEqual([16, 128]);
    expect(getParent(s().doc, 'b')?.id).toBe('F');
  });
});

describe('real components in a stack', () => {
  it('a hugging button takes the width its label needs; a list row fills', () => {
    const btn: ComponentNode = { ...createGroup({ name: 'b' }), id: 'btn', component: { kind: 'button', props: { label: 'OK' } } };
    const row: ComponentNode = { ...createGroup({ name: 'r' }), id: 'row', component: { kind: 'list-row', props: {} } };
    const doc = wireframe([], [row, btn]);
    const b = (findNode(doc, 'btn') as ComponentNode).component.size!;
    expect(b.width).toBeLessThan(120);
    expect(b.width).toBeGreaterThan(30);
    // list-row is edge to edge by default (sizing.bleed): it spans the screen's padding
    expect((findNode(doc, 'row') as ComponentNode).component.size).toEqual({ width: 390, height: 56 });
    expect(pos(doc, 'row')).toEqual([0, 16]);
    expect(pos(doc, 'btn')).toEqual([16, 16 + 56 + 12]);
  });
});

describe('library drop', () => {
  it('a component dropped on a stack is inserted at that point', async () => {
    const { insertComponent } = await import('../componentCommands');
    s().load(wireframe());
    const id = await insertComponent('heading', { x: 200, y: 175 });
    expect(order(s().doc)).toEqual(['a', id, 'b', 'c']);
    expect(pos(s().doc, id!)).toEqual([16, 128]);
  });
});

describe('editing traits of stacks', () => {
  it('a stack is not painted by the user and not rotated; its flow children are not rotated, free ones can be', async () => {
    const { canRotateNode, canRotateSelection, isUserPaintable } = await import('@/model');
    const r = { ...createRect({ width: 50, height: 20 }), id: 'r' };
    const free = { ...createRect({ width: 50, height: 20 }), id: 'free', layoutItem: { position: 'free' as const } };
    const stackNode: GroupNode = { ...createGroup({ name: 's' }), id: 's', layout: { kind: 'vstack', gap: 0, padding: 0, align: 'start' }, children: [r, free] };
    const doc = wireframe([], [stackNode]);
    const st = findNode(doc, 's')!;
    expect(isUserPaintable(st)).toBe(false);
    expect(canRotateNode(st)).toBe(false);
    expect(canRotateSelection(doc, ['s'])).toBe(false);
    expect(canRotateSelection(doc, ['r'])).toBe(false);
    expect(canRotateSelection(doc, ['free'])).toBe(true);
    expect(isUserPaintable(findNode(doc, 'r')!)).toBe(true);
    // screens keep their behaviour
    expect(canRotateNode(findNode(doc, 'F')!)).toBe(true);
  });
});
