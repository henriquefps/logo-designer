import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  createGroup,
  createRect,
  findNode,
  localBounds,
  type ComponentNode,
  type DesignDocument,
  type GroupNode,
  type LayoutInfo,
  type LayoutItemInfo,
  type SceneNode,
  type ScreenNode,
} from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { defaultScreenLayout } from '../layout';
import { materializeDocument, runWireframePipeline } from '../pipeline';
import { addScreen } from '../screens';

/** Placeholder instance (sizing fill × hug, default 342 × 120); `height` is its build height. */
const box = (id: string, height: number, item?: LayoutItemInfo): ComponentNode => ({
  ...createGroup({ name: id }),
  id,
  component: { kind: 'placeholder', props: { label: id, height } },
  ...(item ? { layoutItem: item } : {}),
});

const stack = (id: string, layout: Partial<LayoutInfo> & Pick<LayoutInfo, 'kind'>, children: SceneNode[], item?: LayoutItemInfo): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 0, padding: 0, align: 'stretch', ...layout },
  children,
  ...(item ? { layoutItem: item } : {}),
});

/** A wireframe with one phone frame (id `F`) holding `children`; `layout` = the frame's layout (default: the phone default). */
function wireframe(children: SceneNode[], layout: LayoutInfo | null = defaultScreenLayout('phone')): DesignDocument {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const id = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0, layout });
  const frame = doc.children.find((n) => n.id === id) as ScreenNode;
  frame.id = 'F';
  frame.children = children;
  return materializeDocument(doc);
}

const n = <T extends SceneNode = GroupNode>(doc: DesignDocument, id: string) => findNode(doc, id) as T;
const pos = (doc: DesignDocument, id: string) => {
  const t = n(doc, id).transform;
  return [t.x, t.y];
};
const size = (doc: DesignDocument, id: string) => {
  const g = n(doc, id);
  const s = g.component?.size ?? g.layout?.size;
  return s ? [s.width, s.height] : null;
};
const frameHeight = (doc: DesignDocument) => n<ScreenNode>(doc, 'F').screen.height;

describe('vertical stack (a screen)', () => {
  it('stacks children with padding and gap; fill children take the inner width', () => {
    const doc = wireframe([box('a', 100), box('b', 200)]);
    expect(pos(doc, 'a')).toEqual([16, 16]);
    expect(pos(doc, 'b')).toEqual([16, 128]);
    expect(size(doc, 'a')).toEqual([358, 100]);
    expect(frameHeight(doc)).toBe(844);
  });

  it('the frame grows with the content, never below the platform minimum', () => {
    const doc = wireframe([box('a', 1000), box('b', 200)]);
    expect(frameHeight(doc)).toBe(16 + 1000 + 12 + 200 + 16);
    expect(frameHeight(wireframe([]))).toBe(844);
  });

  it('align: start / center / end place hugging and fixed children; stretch makes hugging ones fill', () => {
    const kids = () => [box('fixed', 50, { width: 100 }), box('hug', 50, { width: 'hug' })];
    const at = (align: LayoutInfo['align']) => wireframe(kids(), { kind: 'vstack', gap: 0, padding: 10, align });
    expect(pos(at('start'), 'fixed')).toEqual([10, 10]);
    expect(pos(at('center'), 'fixed')).toEqual([10 + (370 - 100) / 2, 10]);
    expect(pos(at('end'), 'fixed')).toEqual([10 + 370 - 100, 10]);
    // hug width of a component = its definition's default width (342)
    expect(size(at('start'), 'hug')).toEqual([342, 50]);
    expect(size(at('stretch'), 'hug')).toEqual([370, 50]);
    expect(size(at('stretch'), 'fixed')).toEqual([100, 50]);
  });

  it('fill height takes the space left up to the screen minimum (shared between fill children)', () => {
    const doc = wireframe([box('top', 100), box('grow', 50, { height: 'fill' }), box('grow2', 50, { height: 'fill' })]);
    const extra = 844 - 32 - (100 + 50 + 50 + 24);
    expect(size(doc, 'grow')).toEqual([358, 50 + extra / 2]);
    expect(pos(doc, 'grow2')[1]).toBeCloseTo(16 + 100 + 12 + 50 + extra / 2 + 12);
    expect(frameHeight(doc)).toBe(844);
  });

  it('fixed heights are passed to the build (the box is that tall)', () => {
    const doc = wireframe([box('a', 100, { height: 40 })]);
    expect(size(doc, 'a')).toEqual([358, 40]);
  });

  it('plain shapes keep their size and are only moved (their bounds land on the slot)', () => {
    const r = createRect({ width: 80, height: 40, transform: { x: 300, y: 500 } });
    const doc = wireframe([box('a', 100), { ...r, id: 'r' }]);
    const moved = n<SceneNode>(doc, 'r');
    expect(moved.type === 'rect' && [moved.width, moved.height]).toEqual([80, 40]);
    // a rect is centred on its origin: top-left (16, 128) → centre (56, 148)
    expect(pos(doc, 'r')).toEqual([56, 148]);
  });

  it('hidden children take no space', () => {
    const doc = wireframe([{ ...box('a', 100), visible: false }, box('b', 100)]);
    expect(pos(doc, 'b')).toEqual([16, 16]);
  });
});

describe('pinned-bottom and free', () => {
  it('pinned children sit at the bottom of the minimum height, full width, edge to edge', () => {
    const doc = wireframe([box('a', 100), box('nav', 64, { position: 'pinned-bottom' })]);
    expect(pos(doc, 'nav')).toEqual([0, 844 - 64]);
    expect(size(doc, 'nav')).toEqual([390, 64]);
    expect(frameHeight(doc)).toBe(844);
  });

  it('…or at the bottom of the content when it is taller', () => {
    const doc = wireframe([box('a', 1000), box('nav', 64, { position: 'pinned-bottom' })]);
    expect(frameHeight(doc)).toBe(16 + 1000 + 16 + 64);
    expect(pos(doc, 'nav')).toEqual([0, 16 + 1000 + 16]);
  });

  it('several pinned children stack in order', () => {
    const doc = wireframe([box('bar', 50, { position: 'pinned-bottom' }), box('nav', 64, { position: 'pinned-bottom' })]);
    expect(pos(doc, 'bar')).toEqual([0, 844 - 114]);
    expect(pos(doc, 'nav')).toEqual([0, 844 - 64]);
  });

  it('free children keep their position and are ignored by the flow and the height', () => {
    const fab = { ...box('fab', 56, { position: 'free', width: 56 }), transform: { x: 300, y: 2000, rotation: 0, scaleX: 1, scaleY: 1 } };
    const doc = wireframe([fab, box('a', 100)]);
    expect(pos(doc, 'fab')).toEqual([300, 2000]);
    expect(pos(doc, 'a')).toEqual([16, 16]);
    expect(frameHeight(doc)).toBe(844);
  });

  it('pinned-bottom inside a nested stack behaves as flow', () => {
    const doc = wireframe([stack('s', { kind: 'vstack', gap: 4 }, [box('x', 20, { position: 'pinned-bottom' }), box('y', 20)])]);
    expect(pos(doc, 'x')).toEqual([0, 0]);
    expect(pos(doc, 'y')).toEqual([0, 24]);
  });
});

describe('horizontal stack and grid', () => {
  it('hstack: fixed and hug widths first, fill children share the rest; height hugs the tallest', () => {
    const row = stack('row', { kind: 'hstack', gap: 10, padding: 5, align: 'start' }, [box('fixed', 30, { width: 100 }), box('f1', 50), box('f2', 20)]);
    const doc = wireframe([row]);
    const share = (358 - 10 - 100 - 2 * 10) / 2;
    expect(pos(doc, 'row')).toEqual([16, 16]);
    expect(size(doc, 'row')).toEqual([358, 60]);
    expect(pos(doc, 'fixed')).toEqual([5, 5]);
    expect(pos(doc, 'f1')).toEqual([5 + 100 + 10, 5]);
    expect(pos(doc, 'f2')).toEqual([5 + 100 + 10 + share + 10, 5]);
    expect(size(doc, 'f1')).toEqual([share, 50]);
  });

  it('hstack align center / end / stretch on the cross axis', () => {
    const at = (align: LayoutInfo['align']) => wireframe([stack('row', { kind: 'hstack', align }, [box('tall', 100, { width: 50 }), box('short', 20, { width: 50 })])]);
    expect(pos(at('center'), 'short')).toEqual([50, 40]);
    expect(pos(at('end'), 'short')).toEqual([50, 80]);
    expect(size(at('stretch'), 'short')).toEqual([50, 100]);
  });

  it('grid: N columns of equal width, rows as tall as their tallest cell', () => {
    const grid = stack('g', { kind: 'grid', columns: 3, gap: 10, align: 'start' }, [box('a', 40), box('b', 80), box('c', 40), box('d', 60)]);
    const doc = wireframe([grid]);
    const cell = (358 - 20) / 3;
    expect(pos(doc, 'a')).toEqual([0, 0]);
    expect(pos(doc, 'b')[0]).toBeCloseTo(cell + 10);
    expect(pos(doc, 'c')[0]).toBeCloseTo(2 * (cell + 10));
    expect(pos(doc, 'd')).toEqual([0, 90]);
    expect(size(doc, 'a')).toEqual([cell, 40]);
    expect(size(doc, 'g')).toEqual([358, 80 + 10 + 60]);
  });
});

describe('nesting and containers', () => {
  it('nested stacks: sizes flow down (fill) and up (hug)', () => {
    const inner = stack('inner', { kind: 'vstack', gap: 8, padding: 12 }, [box('x', 30), box('y', 30)]);
    const row = stack('row', { kind: 'hstack', gap: 10 }, [stack('side', { kind: 'vstack' }, [box('s', 200)], { width: 100 }), inner]);
    const doc = wireframe([row, box('after', 10)]);
    expect(size(doc, 'side')).toEqual([100, 200]);
    expect(size(doc, 'inner')).toEqual([358 - 110, 200]); // stretch: as tall as the row
    expect(pos(doc, 'inner')).toEqual([110, 0]);
    expect(size(doc, 'x')).toEqual([358 - 110 - 24, 30]);
    expect(pos(doc, 'y')).toEqual([12, 12 + 30 + 8]);
    expect(pos(doc, 'after')).toEqual([16, 16 + 200 + 12]);
  });

  it('a container hugging its width (hug) measures its children', () => {
    const doc = wireframe([stack('h', { kind: 'hstack', gap: 6, padding: 4 }, [box('a', 20, { width: 40 }), box('b', 20, { width: 60 })], { width: 'hug' })]);
    expect(size(doc, 'h')).toEqual([4 + 40 + 6 + 60 + 4, 28]);
  });

  it('a container on the canvas (outside any screen) keeps its stored width and hugs its height', () => {
    const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
    const s = stack('s', { kind: 'vstack', gap: 10, padding: 10, size: { width: 200, height: 1 } }, [box('a', 20), box('b', 20)]);
    doc.children.push({ ...s, transform: { ...s.transform, x: 1000, y: 1000 } });
    const out = materializeDocument(doc);
    expect(size(out, 's')).toEqual([200, 70]);
    expect(pos(out, 's')).toEqual([1000, 1000]);
    expect(pos(out, 'b')).toEqual([10, 40]);
    // The container's box (with its padding) is its bounds.
    expect(localBounds(n(out, 's'))).toEqual({ x: 0, y: 0, width: 200, height: 70 });
  });

  it('a free frame (no layout) leaves its content alone but lays out stacks in it', () => {
    const s = { ...stack('s', { kind: 'vstack', gap: 5, size: { width: 100, height: 1 } }, [box('a', 20), box('b', 20)]), transform: { x: 30, y: 40, rotation: 0, scaleX: 1, scaleY: 1 } };
    const doc = wireframe([s], null);
    expect(pos(doc, 's')).toEqual([30, 40]);
    expect(pos(doc, 'b')).toEqual([0, 25]);
    expect(frameHeight(doc)).toBe(844);
  });
});

describe('idempotence and incremental runs', () => {
  const big = () =>
    wireframe([
      box('top', 56),
      stack('row', { kind: 'hstack', gap: 8 }, [box('l', 40, { width: 'hug' }), box('r', 40)]),
      stack('g', { kind: 'grid', columns: 2, gap: 8 }, [box('g1', 30), box('g2', 50), box('g3', 30)]),
      box('nav', 64, { position: 'pinned-bottom' }),
    ]);

  it('a second run changes nothing', () => {
    const doc = big();
    expect(runWireframePipeline(doc, null, 'load')?.patches).toBeUndefined();
    expect(runWireframePipeline(doc, doc, 'settle')).toBeNull();
    expect(runWireframePipeline(doc, doc, 'change')).toBeNull();
  });

  it('logo documents never reach the layout step', () => {
    const doc = createDocument();
    doc.children.push(stack('s', { kind: 'vstack', gap: 10 }, [box('a', 20)]));
    expect(materializeDocument(doc)).toBe(doc);
  });
});

describe('layout in the doc store', () => {
  const s = () => useDocStore.getState();
  beforeEach(() => s().load(createDocument()));

  it('adding a component to a screen places it in the flow (one undo step)', () => {
    s().load(wireframe([box('a', 100)]));
    s().addNodes([box('b', 50)], { parentId: 'F' });
    expect(pos(s().doc, 'b')).toEqual([16, 128]);
    s().addNodes([box('c', 20)], { parentId: 'F', index: 0 });
    expect(pos(s().doc, 'c')).toEqual([16, 16]);
    expect(pos(s().doc, 'a')).toEqual([16, 48]);
    s().undo();
    expect(pos(s().doc, 'a')).toEqual([16, 16]);
  });

  it('changing the gap relays out; untouched screens keep their identity', () => {
    const doc = structuredClone(wireframe([box('a', 100), box('b', 100)]));
    const other = addScreen(doc, { platform: 'phone', name: 'Other', x: 600, y: 0 });
    s().load(doc);
    const before = n(s().doc, other);
    s().updateNodes(['F'], (g) => {
      if (g.type === 'group' && g.layout) g.layout.gap = 40;
    });
    expect(pos(s().doc, 'b')).toEqual([16, 156]);
    expect(n(s().doc, other)).toBe(before);
  });

  it('while dragging, a flow child follows the pointer; it lands in its slot when the gesture settles', () => {
    s().load(wireframe([box('a', 100), box('b', 100)]));
    s().beginTransaction('Move');
    s().updateNode('a', { transform: { x: 200, y: 400 } });
    expect(pos(s().doc, 'a')).toEqual([200, 400]);
    s().commitTransaction();
    expect(pos(s().doc, 'a')).toEqual([16, 16]);
  });

  it('resizing a child inside a stack makes that dimension fixed', () => {
    s().load(wireframe([box('a', 100), box('b', 100)]));
    s().updateNodes(['a'], (g) => {
      if (g.type === 'group' && g.component?.size) g.component.size = { width: 200, height: 100 };
    });
    expect(n(s().doc, 'a').layoutItem).toEqual({ width: 200 });
    expect(size(s().doc, 'a')).toEqual([200, 100]);
  });

  it('removing the frame layout keeps the content where it is', () => {
    s().load(wireframe([box('a', 100), box('b', 300)]));
    s().updateNodes(['F'], (g) => {
      if (g.type === 'group') delete g.layout;
    });
    expect(pos(s().doc, 'b')).toEqual([16, 128]);
    // Free content again: moving it moves it, and the frame grows with it (centre still on the frame).
    s().updateNode('b', { transform: { y: 600 } });
    expect(pos(s().doc, 'b')).toEqual([16, 600]);
    expect(frameHeight(s().doc)).toBe(900);
  });
});

describe('performance', () => {
  it('10 screens × 100 components: an edit in one screen relays out only that one, fast', () => {
    const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
    for (let i = 0; i < 10; i++) {
      const id = addScreen(doc, { platform: 'phone', x: i * 500, y: 0 });
      const f = doc.children.find((c) => c.id === id) as ScreenNode;
      f.children = Array.from({ length: 100 }, (_, j) =>
        j % 10 === 0 ? stack(`s${i}-${j}`, { kind: 'hstack', gap: 8 }, [box(`s${i}-${j}-a`, 40), box(`s${i}-${j}-b`, 40)]) : box(`c${i}-${j}`, 40 + (j % 3) * 10),
      );
    }
    const s = useDocStore.getState();
    s.load(doc);
    const others = useDocStore.getState().doc.children.filter((_, i) => i !== 3);
    s.beginTransaction('Move');
    const times: number[] = [];
    for (let k = 0; k < 40; k++) {
      const t0 = performance.now();
      useDocStore.getState().updateNode('c3-55', { transform: { x: 100 + k, y: 300 + k } });
      times.push(performance.now() - t0);
    }
    useDocStore.getState().commitTransaction();
    expect(pos(useDocStore.getState().doc, 'c3-55')).toEqual([16, pos(useDocStore.getState().doc, 'c3-55')[1]]);
    // The other screens were not touched at all (same objects).
    useDocStore.getState().doc.children.filter((_, i) => i !== 3).forEach((n, i) => expect(n).toBe(others[i]));
    // Median drag frame (store + pipeline, after warm-up): ~1 ms locally; generous for a loaded machine running the suite in parallel.
    const median = times.slice(10).sort((a, b) => a - b)[15];
    expect(median).toBeLessThan(40);
  });
});
