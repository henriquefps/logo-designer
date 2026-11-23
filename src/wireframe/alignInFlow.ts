// The align / distribute buttons for nodes a stack places (docs/wireframe-mode.md → Aligning in a stack).
//
// A child of a stack cannot be moved by a translation: the layout puts it back. The buttons set what the
// layout reads instead, and the plan (pure, on a plain document) says which one and why when nothing applies:
//
//   horizontal buttons (left / center / right)         vertical buttons (top / middle / bottom)
//   - text with an `align` prop that fills the width:   - in a vstack (its main axis): the stack's `justify`;
//     its `align` prop;                                  - in an hstack (its cross axis): see below;
//   - a stack that fills the width: its own contents    - in a grid: nothing (placed by the grid).
//     (`align` of a vstack / grid, `justify` of an hstack);
//   - a child of an hstack (its main axis): the stack's `justify`;
//   - a child of a vstack / grid (its cross axis): see below.
//
// Cross axis: the child's `alignSelf`; when every child of the stack is selected (or it is the only one) the
// stack's `align` instead. A child that fills the axis has nothing to place: the plan says so.
import {
  findNode,
  locate,
  topmostIds,
  type AlignMode,
  type DesignDocument,
  type Id,
  type LayoutAlign,
  type LayoutInfo,
  type LayoutJustify,
  type SceneNode,
} from '@/model';
import { alignOf, itemSizing, type ContainerNode } from './layout';
import { layoutParent } from './layoutEdit';
import { getComponent } from './library/registry';
import { resizableAxes } from './library/types';

type Side = 'start' | 'center' | 'end';
const SIDE: Record<AlignMode, Side> = { left: 'start', hcenter: 'center', right: 'end', top: 'start', vcenter: 'center', bottom: 'end' };
const TEXT: Record<Side, string> = { start: 'left', center: 'center', end: 'right' };
const isHorizontal = (m: AlignMode) => m === 'left' || m === 'hcenter' || m === 'right';

export type FlowAlignOp =
  /** A component's `align` prop (heading, text). */
  | { kind: 'prop'; id: Id; value: string }
  /** `layoutItem.alignSelf` (`undefined`: back to the stack's `align`). */
  | { kind: 'self'; id: Id; value: LayoutAlign | undefined }
  /** A container's `layout.align` / `layout.justify`. */
  | { kind: 'layout'; id: Id; patch: { align?: LayoutAlign; justify?: LayoutJustify } };

export interface FlowAlignPlan {
  ops: FlowAlignOp[];
  /** Nodes no stack places (free, a free screen, a screen frame): aligned the usual way, by moving them. */
  legacy: Id[];
  /** Why something was not (or could not be) aligned: shown as a toast. */
  notes: string[];
}

/** The `align` prop of a text-like component (heading, text), if its definition has one. */
function textAlignProp(n: SceneNode): boolean {
  if (n.type !== 'group' || !n.component) return false;
  const spec = getComponent(n.component.kind)?.props.align;
  return spec?.type === 'choice' && spec.options.includes('left') && spec.options.includes('center') && spec.options.includes('right');
}

const isComponent = (n: SceneNode) => n.type === 'group' && !!n.component;
const isContainer = (n: SceneNode): n is ContainerNode => n.type === 'group' && !!n.layout && !n.component;
const axesOf = (n: SceneNode) => {
  const def = n.type === 'group' && n.component ? getComponent(n.component.kind) : undefined;
  return def ? resizableAxes(def) : { width: true, height: true };
};

/** True when the child takes the whole width of its cell / column / row share (fill, or hug under `stretch`). */
function fillsWidth(n: SceneNode, parent: ContainerNode): boolean {
  if (!isComponent(n) && !isContainer(n)) return false;
  const s = itemSizing(n);
  if (typeof s.width === 'number') return false;
  if (s.width === 'fill') return true;
  return parent.layout.kind !== 'hstack' && alignOf(n, parent.layout.align) === 'stretch' && axesOf(n).width;
}

const fillsHeight = (n: SceneNode) => (isComponent(n) || isContainer(n)) && itemSizing(n).height === 'fill' && axesOf(n).height;

/** The children a stack places in its flow. */
const flowKids = (p: ContainerNode) => p.children.filter((c) => c.visible && itemSizing(c).position !== 'free');

function currentSide(v: LayoutAlign | LayoutJustify | undefined): string {
  return v ?? 'start';
}

/** What the align buttons do for `ids` (topmost nodes of a wireframe document). */
export function planFlowAlign(doc: DesignDocument, ids: Id[], mode: AlignMode): FlowAlignPlan {
  const plan: FlowAlignPlan = { ops: [], legacy: [], notes: [] };
  if (!doc.wireframe) return { ...plan, legacy: topmostIds(doc, ids) };
  const side = SIDE[mode];
  const horizontal = isHorizontal(mode);
  const note = (s: string) => {
    if (!plan.notes.includes(s)) plan.notes.push(s);
  };
  const tops = topmostIds(doc, ids);
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  const selectedIn = (p: ContainerNode) => {
    const flow = flowKids(p);
    return flow.length > 0 && flow.every((c) => tops.includes(c.id));
  };

  for (const id of tops) {
    const loc = locate(doc, id);
    if (!loc) continue;
    const n = loc.node;
    const parent = layoutParent(doc, id);
    if (!parent || n.visible === false) {
      plan.legacy.push(id);
      continue;
    }
    const position = itemSizing(n).position;
    if (position === 'free') {
      plan.legacy.push(id);
      continue;
    }
    if (position === 'pinned-bottom') {
      note('Pinned to the bottom: the bar spans the screen. Make it free to move it');
      continue;
    }
    const kind = parent.layout.kind;
    const name = n.name;

    if (horizontal) {
      // 1. Text that fills the width: its own alignment.
      if (textAlignProp(n) && fillsWidth(n, parent)) {
        plan.ops.push({ kind: 'prop', id, value: TEXT[side] });
        continue;
      }
      // 2. A stack that fills the width: where its content sits.
      if (isContainer(n) && fillsWidth(n, parent)) {
        if (n.layout.kind === 'hstack') plan.ops.push({ kind: 'layout', id, patch: { justify: side } });
        else plan.ops.push({ kind: 'layout', id, patch: { align: side } });
        continue;
      }
      // 3. In a row: the row's justify.
      if (kind === 'hstack') {
        if (flowKids(parent).some((c) => fillsWidth(c, parent))) note('A sibling fills the row, so there is no room left to place “' + name + '”. Set its width to Hug');
        else if (once(`j${parent.id}`)) plan.ops.push({ kind: 'layout', id: parent.id, patch: { justify: side } });
        continue;
      }
      // 4. In a column or grid: this child, or every child through the stack.
      if (fillsWidth(n, parent)) {
        note(`“${name}” fills the width, so there is nothing to place. Set its width to Hug`);
        continue;
      }
      if (selectedIn(parent)) {
        if (once(`a${parent.id}`)) plan.ops.push({ kind: 'layout', id: parent.id, patch: { align: side } });
        plan.ops.push({ kind: 'self', id, value: undefined });
      } else plan.ops.push({ kind: 'self', id, value: side === parent.layout.align ? undefined : side });
      continue;
    }

    // Vertical.
    if (kind === 'vstack') {
      const tall = !!parent.screen || itemSizing(parent).height !== 'hug';
      if (flowKids(parent).some(fillsHeight)) note('A sibling fills the height, so there is no room left to place “' + name + '”. Set its height to Hug');
      else if (!tall) note('The stack is as tall as its content: give it a fixed height to place its children vertically');
      else if (once(`j${parent.id}`)) plan.ops.push({ kind: 'layout', id: parent.id, patch: { justify: side } });
      continue;
    }
    if (kind === 'hstack') {
      if (fillsHeight(n)) {
        note(`“${name}” fills the height of the row, so there is nothing to place. Set its height to Hug`);
        continue;
      }
      if (selectedIn(parent)) {
        if (once(`a${parent.id}`)) plan.ops.push({ kind: 'layout', id: parent.id, patch: { align: side } });
        plan.ops.push({ kind: 'self', id, value: undefined });
      } else plan.ops.push({ kind: 'self', id, value: side === parent.layout.align ? undefined : side });
      continue;
    }
    note('Placed by the grid: use Layout → Gap and Columns');
  }

  // Drop what would change nothing, and say so when that is all there was.
  const before = plan.ops.length;
  plan.ops = plan.ops.filter((op) => !isNoop(doc, op));
  if (before && !plan.ops.length && !plan.legacy.length && !plan.notes.length) note('Already aligned');
  return plan;
}

function isNoop(doc: DesignDocument, op: FlowAlignOp): boolean {
  const n = findNode(doc, op.id);
  if (!n) return true;
  if (op.kind === 'prop') return n.type === 'group' && (n.component?.props as Record<string, unknown> | undefined)?.align === op.value;
  if (op.kind === 'self') return n.layoutItem?.alignSelf === op.value;
  if (n.type !== 'group' || !n.layout) return true;
  const l = n.layout as LayoutInfo;
  return (op.patch.align === undefined || l.align === op.patch.align) && (op.patch.justify === undefined || currentSide(l.justify) === op.patch.justify);
}

/** What the distribute buttons do for `ids`: a row's / column's `space-between`. */
export function planFlowDistribute(doc: DesignDocument, ids: Id[], mode: 'horizontal' | 'vertical'): FlowAlignPlan {
  const plan: FlowAlignPlan = { ops: [], legacy: [], notes: [] };
  if (!doc.wireframe) return { ...plan, legacy: topmostIds(doc, ids) };
  const parents = new Map<Id, Id[]>();
  for (const id of topmostIds(doc, ids)) {
    const parent = layoutParent(doc, id);
    const n = findNode(doc, id);
    if (!parent || !n || itemSizing(n).position === 'free') plan.legacy.push(id);
    else parents.set(parent.id, [...(parents.get(parent.id) ?? []), id]);
  }
  for (const [pid, kids] of parents) {
    const parent = findNode(doc, pid) as ContainerNode;
    const along = (parent.layout.kind === 'hstack' && mode === 'horizontal') || (parent.layout.kind === 'vstack' && mode === 'vertical');
    if (!along) plan.notes.push('The stack places its children along the other direction: use Layout → Gap for the spacing');
    else if (kids.length < 2) plan.notes.push('Select two or more children to spread them');
    else if (flowKids(parent).some((c) => (mode === 'horizontal' ? fillsWidth(c, parent) : fillsHeight(c)))) plan.notes.push('A child fills the space, so there is nothing to spread');
    else if (parent.layout.justify !== 'space-between') plan.ops.push({ kind: 'layout', id: pid, patch: { justify: 'space-between' } });
    else plan.notes.push('Already spread');
  }
  return plan;
}

/** Writes a plan's ops into a document draft (one undo step in the caller). */
export function applyFlowOps(draft: DesignDocument, ops: FlowAlignOp[]): void {
  for (const op of ops) {
    const node = locate(draft, op.id)?.node;
    if (!node || node.type !== 'group') continue;
    if (op.kind === 'prop') {
      if (node.component) (node.component.props as Record<string, unknown>).align = op.value;
    } else if (op.kind === 'self') {
      const next = { ...node.layoutItem };
      if (op.value === undefined) delete next.alignSelf;
      else next.alignSelf = op.value;
      if (Object.keys(next).length) node.layoutItem = next;
      else delete node.layoutItem;
    } else if (node.layout) {
      if (op.patch.align !== undefined) node.layout.align = op.patch.align;
      if (op.patch.justify !== undefined) {
        if (op.patch.justify === 'start') delete node.layout.justify;
        else node.layout.justify = op.patch.justify;
      }
    }
  }
}
