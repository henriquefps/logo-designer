// Justify (the main axis of a stack), alignSelf and the align buttons for nodes a stack places.
import { describe, expect, it } from 'vitest';
import { createDocument, createGroup, createRect, findNode, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type LayoutItemInfo, type SceneNode, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { defaultScreenLayout } from '../layout';
import { applyFlowOps, planFlowAlign, planFlowDistribute } from '../alignInFlow';
import { alignNodes } from '../alignCommands';
import { alignWords } from '../aiExport';
import { materializeDocument } from '../pipeline';
import { addScreen } from '../screens';
import { inst, stack } from '../spec/__tests__/fixtures';

const box = (id: string, height: number, item?: LayoutItemInfo): ComponentNode => ({
  ...createGroup({ name: id }),
  id,
  component: { kind: 'placeholder', props: { label: id, height } },
  ...(item ? { layoutItem: item } : {}),
});
const frame = (children: SceneNode[], layout: LayoutInfo | null = defaultScreenLayout('phone')): DesignDocument => {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const id = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0, layout });
  const f = doc.children.find((n) => n.id === id) as ScreenNode;
  f.id = 'F';
  f.children = children;
  return materializeDocument(doc);
};
const n = <T extends SceneNode = GroupNode>(doc: DesignDocument, id: string) => findNode(doc, id) as T;
const pos = (doc: DesignDocument, id: string) => [n(doc, id).transform.x, n(doc, id).transform.y];
/** Applies a plan to a document and lays it out again. */
const run = (doc: DesignDocument, plan: ReturnType<typeof planFlowAlign>) => {
  const next = structuredClone(doc);
  applyFlowOps(next, plan.ops);
  return materializeDocument(next);
};
const btn = (id: string, item?: LayoutItemInfo) => inst(id, 'button', { label: id }, item ?? { width: 'hug' });

describe('justify (the main axis)', () => {
  const row = (justify: LayoutInfo['justify']) => frame([stack('r', { kind: 'hstack', gap: 10, padding: 0, align: 'center', justify }, [box('a', 40, { width: 100 }), box('b', 40, { width: 100 })])], { kind: 'vstack', gap: 0, padding: 0, align: 'stretch' });
  it('hstack: start (default), center, end, space-between over the free width', () => {
    expect(pos(row(undefined), 'b')[0]).toBe(110);
    expect(pos(row('center'), 'a')[0]).toBe((390 - 210) / 2);
    expect(pos(row('end'), 'b')[0]).toBe(390 - 100);
    const spread = row('space-between');
    expect(pos(spread, 'a')[0]).toBe(0);
    expect(pos(spread, 'b')[0]).toBe(290);
  });
  it('a child that fills the row leaves nothing to distribute', () => {
    const doc = frame([stack('r', { kind: 'hstack', gap: 10, padding: 0, justify: 'center' }, [box('a', 40, { width: 100 }), box('b', 40, { width: 'fill' })])], { kind: 'vstack', gap: 0, padding: 0, align: 'stretch' });
    expect(pos(doc, 'a')[0]).toBe(0);
    expect(n(doc, 'b').component!.size!.width).toBe(280);
  });
  it('vstack: the height left in a screen is placed by justify', () => {
    const at = (justify: LayoutInfo['justify']) => frame([box('a', 100, { width: 'hug' }), box('b', 100, { width: 'hug' })], { kind: 'vstack', gap: 20, padding: 10, align: 'start', justify });
    expect(pos(at(undefined), 'a')[1]).toBe(10);
    expect(pos(at('end'), 'b')[1]).toBe(844 - 10 - 100);
    expect(pos(at('center'), 'a')[1]).toBe(10 + (844 - 20 - 220) / 2);
    expect(pos(at('space-between'), 'b')[1]).toBe(844 - 10 - 100);
  });
  it('grids ignore it', () => {
    const doc = frame([stack('g', { kind: 'grid', columns: 2, gap: 0, padding: 0, justify: 'center' }, [box('a', 40), box('b', 40)])], { kind: 'vstack', gap: 0, padding: 0, align: 'stretch' });
    expect(pos(doc, 'a')[0]).toBe(0);
  });
});

describe('alignSelf', () => {
  it('overrides the stack align for one child', () => {
    const doc = frame([box('a', 40, { width: 100 }), box('b', 40, { width: 100, alignSelf: 'end' }), box('c', 40, { width: 100, alignSelf: 'center' })], { kind: 'vstack', gap: 0, padding: 0, align: 'start' });
    expect(pos(doc, 'a')[0]).toBe(0);
    expect(pos(doc, 'b')[0]).toBe(290);
    expect(pos(doc, 'c')[0]).toBe(145);
  });
  it('stretch on one hug child fills it', () => {
    const doc = frame([box('a', 40, { width: 'hug', alignSelf: 'stretch' })], { kind: 'vstack', gap: 0, padding: 0, align: 'start' });
    expect(n(doc, 'a').component!.size!.width).toBe(390);
  });
  it('in an hstack it is the vertical placement', () => {
    const doc = frame([stack('r', { kind: 'hstack', gap: 0, padding: 0, align: 'start' }, [box('a', 40, { width: 50 }), box('b', 100, { width: 50, alignSelf: 'end' })])], { kind: 'vstack', gap: 0, padding: 0, align: 'stretch' });
    expect(pos(doc, 'b')[1]).toBe(0);
    const doc2 = frame([stack('r', { kind: 'hstack', gap: 0, padding: 0, align: 'start' }, [box('a', 100, { width: 50 }), box('b', 40, { width: 50, alignSelf: 'end' })])], { kind: 'vstack', gap: 0, padding: 0, align: 'stretch' });
    expect(pos(doc2, 'b')[1]).toBe(60);
  });
});

// A structure like a presenter screen: a title, a row of three buttons, and two cards that each hold a centered stack.
const scene = () =>
  frame(
    [
      inst('title', 'heading', { text: 'Title' }),
      stack('row', { kind: 'hstack', gap: 8, padding: 0, align: 'center' }, [btn('b1'), btn('b2'), btn('b3')]),
      stack('cards', { kind: 'hstack', gap: 8, padding: 0, align: 'stretch' }, [
        stack('card1', { kind: 'vstack', gap: 4, padding: 8, align: 'center' }, [{ ...createRect({ width: 16, height: 16 }), id: 'icon1' }, inst('label1', 'heading', { text: 'One' })], { width: 'fill' }),
        stack('card2', { kind: 'vstack', gap: 4, padding: 8, align: 'center' }, [{ ...createRect({ width: 16, height: 16 }), id: 'icon2' }, inst('label2', 'heading', { text: 'Two' })], { width: 'fill' }),
      ]),
      btn('lone'),
    ],
    { kind: 'vstack', gap: 12, padding: 16, align: 'start' },
  );

describe('the align buttons inside stacks', () => {
  it('a fill-width heading: its own align prop', () => {
    const doc = scene();
    const plan = planFlowAlign(doc, ['title'], 'hcenter');
    expect(plan.ops).toEqual([{ kind: 'prop', id: 'title', value: 'center' }]);
    expect(n<ComponentNode>(run(doc, plan), 'title').component.props.align).toBe('center');
    expect(planFlowAlign(doc, ['title'], 'right').ops).toEqual([{ kind: 'prop', id: 'title', value: 'right' }]);
  });
  it('an hstack that fills the width (selected): its justify', () => {
    const doc = scene();
    const plan = planFlowAlign(doc, ['row'], 'hcenter');
    expect(plan.ops).toEqual([{ kind: 'layout', id: 'row', patch: { justify: 'center' } }]);
    const after = run(doc, plan);
    // The three buttons sit in the middle of the row: equal room on both sides.
    const left = pos(after, 'b1')[0]; // in the row
    const last = n<ComponentNode>(after, 'b3');
    const right = 358 - (pos(after, 'b3')[0] + last.component.size!.width);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeCloseTo(right, 5);
  });
  it('one button of a row: the row justify', () => {
    const plan = planFlowAlign(scene(), ['b2'], 'right');
    expect(plan.ops).toEqual([{ kind: 'layout', id: 'row', patch: { justify: 'end' } }]);
  });
  it('a hug child of a vstack among siblings: alignSelf', () => {
    const doc = scene();
    const plan = planFlowAlign(doc, ['lone'], 'hcenter');
    expect(plan.ops).toEqual([{ kind: 'self', id: 'lone', value: 'center' }]);
    const after = run(doc, plan);
    const w = n<ComponentNode>(after, 'lone').component.size!.width;
    expect(pos(after, 'lone')[0]).toBeCloseTo(16 + (358 - w) / 2, 5);
    // The title did not move.
    expect(pos(after, 'title')[0]).toBe(16);
  });
  it('left on a child that already sits there removes nothing and says so', () => {
    const plan = planFlowAlign(scene(), ['lone'], 'left');
    expect(plan.ops).toEqual([]);
    expect(plan.notes).toEqual(['Already aligned']);
  });
  it('every child selected: the stack align, and the children follow it', () => {
    const doc = frame([btn('x', { width: 'hug', alignSelf: 'end' }), btn('y')], { kind: 'vstack', gap: 8, padding: 0, align: 'start' });
    const plan = planFlowAlign(doc, ['x', 'y'], 'hcenter');
    expect(plan.ops).toContainEqual({ kind: 'layout', id: 'F', patch: { align: 'center' } });
    const after = run(doc, plan);
    expect(n(after, 'F').layout!.align).toBe('center');
    expect(n(after, 'x').layoutItem?.alignSelf).toBeUndefined();
    expect(pos(after, 'x')[0]).toBe(pos(after, 'y')[0]);
  });
  it('card labels: the fill heading is aligned by its prop, the icon by alignSelf', () => {
    const doc = scene();
    expect(planFlowAlign(doc, ['label1', 'label2'], 'hcenter').ops).toEqual([
      { kind: 'prop', id: 'label1', value: 'center' },
      { kind: 'prop', id: 'label2', value: 'center' },
    ]);
    // Both children of the card selected: the label by its prop, the icon (and so the card's) through its align.
    const both = planFlowAlign(doc, ['icon1', 'label1'], 'right');
    expect(both.ops).toContainEqual({ kind: 'prop', id: 'label1', value: 'right' });
    expect(both.ops).toContainEqual({ kind: 'layout', id: 'card1', patch: { align: 'end' } });
    // The icon alone, among siblings: its own placement.
    expect(planFlowAlign(doc, ['icon1'], 'right').ops).toEqual([{ kind: 'self', id: 'icon1', value: 'end' }]);
  });
  it('vertical buttons: a vstack child sets the stack justify; an hstack child its alignSelf', () => {
    expect(planFlowAlign(scene(), ['title'], 'vcenter').ops).toEqual([{ kind: 'layout', id: 'F', patch: { justify: 'center' } }]);
    // The row has hug buttons of the same height; cards stretch.
    expect(planFlowAlign(scene(), ['b1'], 'bottom').ops).toEqual([{ kind: 'self', id: 'b1', value: 'end' }]);
  });
  it('says why when nothing applies', () => {
    const grid = frame([stack('g', { kind: 'grid', columns: 2, gap: 0, padding: 0 }, [box('a', 40), box('b', 40)])]);
    expect(planFlowAlign(grid, ['a'], 'top').notes).toEqual(['Placed by the grid: use Layout → Gap and Columns']);
    const fill = frame([stack('r', { kind: 'hstack', gap: 0, padding: 0 }, [box('a', 40, { width: 100 }), box('b', 40, { width: 'fill' })])]);
    expect(planFlowAlign(fill, ['a'], 'hcenter').notes[0]).toMatch(/fills the row/);
    const wide = frame([box('w', 40)]);
    expect(planFlowAlign(wide, ['w'], 'hcenter').notes[0]).toMatch(/fills the width/);
    const pinned = frame([inst('nav', 'bottom-navigation', {}, { position: 'pinned-bottom' })]);
    expect(planFlowAlign(pinned, ['nav'], 'left').notes[0]).toMatch(/Pinned/);
  });
  it('a stack as tall as its content cannot place its children vertically', () => {
    const doc = frame([stack('col', { kind: 'vstack', gap: 0, padding: 0 }, [box('a', 40), box('b', 40)])]);
    const plan = planFlowAlign(doc, ['a'], 'bottom');
    expect(plan.ops).toEqual([]);
    expect(plan.notes[0]).toMatch(/as tall as its content/);
  });
  it('free nodes and non-wireframe documents keep moving', () => {
    const free = frame([box('f', 40, { position: 'free', width: 100 })]);
    expect(planFlowAlign(free, ['f'], 'hcenter')).toMatchObject({ ops: [], legacy: ['f'] });
    const plain = createDocument({ name: 'P' });
    const r = { ...createRect({ width: 10, height: 10 }), id: 'r' };
    plain.children.push(r);
    expect(planFlowAlign(plain, ['r'], 'left')).toMatchObject({ ops: [], legacy: ['r'] });
  });
  it('distribute: space-between on the row; a note elsewhere', () => {
    expect(planFlowDistribute(scene(), ['b1', 'b2', 'b3'], 'horizontal').ops).toEqual([{ kind: 'layout', id: 'row', patch: { justify: 'space-between' } }]);
    expect(planFlowDistribute(scene(), ['b1', 'b2', 'b3'], 'vertical').notes[0]).toMatch(/other direction/);
    expect(planFlowDistribute(scene(), ['b1'], 'horizontal').notes[0]).toMatch(/two or more/);
  });
});

describe('the buttons in the store', () => {
  it('one undo step per click', () => {
    const doc = scene();
    useDocStore.getState().load(doc);
    const before = useDocStore.getState().doc;
    alignNodes(['title'], 'hcenter', true);
    const after = useDocStore.getState().doc;
    expect(after).not.toBe(before);
    expect((findNode(after, 'title') as ComponentNode).component.props.align).toBe('center');
    useDocStore.getState().undo();
    expect((findNode(useDocStore.getState().doc, 'title') as ComponentNode).component.props.align).toBe('left');
  });
});

describe('Export for AI wording', () => {
  it('says how a stack places its children when it is not the default', () => {
    expect(alignWords({ kind: 'hstack', gap: 8, padding: 0, align: 'center' })).toBe('');
    expect(alignWords({ kind: 'hstack', gap: 8, padding: 0, align: 'center', justify: 'center' })).toBe('centered');
    expect(alignWords({ kind: 'hstack', gap: 8, padding: 0, align: 'center', justify: 'space-between' })).toBe('spread apart');
    expect(alignWords({ kind: 'vstack', gap: 8, padding: 0, align: 'center' })).toBe('children centered');
    expect(alignWords({ kind: 'vstack', gap: 8, padding: 0, align: 'start' })).toBe('');
  });
});
