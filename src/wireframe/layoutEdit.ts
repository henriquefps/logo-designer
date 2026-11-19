// Editing stacks and grids (docs/wireframe-mode.md → Layout): drop targets, inserting and moving
// nodes into a container at an index, wrapping a selection in a stack and unwrapping it. Pure
// functions on a plain document or an immer draft (like ./screens.ts); the app (select tool,
// Object menu, library panel) and tests use them. The layout step then places what they insert.
import {
  apply,
  fromTransform,
  IDENTITY,
  invert,
  isScreenNode,
  locate,
  multiply,
  newId,
  parentWorldMatrix,
  rectContains,
  toTransform,
  createGroup,
  unionRects,
  type DesignDocument,
  type GroupNode,
  type Id,
  type LayoutKind,
  type Matrix,
  type SceneNode,
  type Vec,
} from '@/model';
import { childBox, defaultLayout, itemSizing, type ContainerNode } from './layout';

type DocLike = Pick<DesignDocument, 'children' | 'wireframe'>;
const asDoc = (d: DocLike) => d as DesignDocument;

/** Where a node dropped at a point lands: before the flow child at `index` of `containerId`'s children. */
export interface LayoutDropTarget {
  containerId: Id;
  /** Index in the container's `children`, counted without the nodes being moved (`exclude`). */
  index: number;
}

/** A frame with a layout, or a stack / grid (not a component instance). */
const laysOut = (n: SceneNode): n is ContainerNode => n.type === 'group' && !!n.layout && !n.component;

/** The layout container directly holding `id`, or null (top level, free frame, plain group). */
export function layoutParent(doc: DocLike, id: Id): ContainerNode | null {
  const loc = locate(asDoc(doc), id);
  if (!loc || loc.parent === doc) return null;
  const p = loc.parent as GroupNode;
  return laysOut(p) ? p : null;
}

/** True when `id` is placed by its parent's layout (a flow or pinned child of a stack / grid). */
export function isLaidOut(doc: DocLike, id: Id): boolean {
  const loc = locate(asDoc(doc), id);
  return !!loc && !!layoutParent(doc, id) && itemSizing(loc.node).position !== 'free';
}

/** The container's box in its own local space. */
function containerRect(n: ContainerNode) {
  if (n.screen) return { x: 0, y: 0, width: n.screen.width, height: n.screen.height };
  const s = n.layout.size ?? childBox({ ...n, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
  return { x: 0, y: 0, width: s.width, height: s.height };
}

/** Flow children of a container (without `exclude`), with their index in that reduced list and their box. */
function flowSlots(c: ContainerNode, exclude: Set<Id>) {
  const kept = c.children.filter((n) => !exclude.has(n.id));
  return kept
    .map((n, index) => ({ n, index }))
    .filter(({ n }) => n.visible && itemSizing(n).position === 'flow')
    .map(({ n, index }) => ({ index, box: childBox(n) }));
}

/** Index (in the reduced list) a point in the container's local space lands on. */
function indexAt(c: ContainerNode, p: Vec, exclude: Set<Id>): number {
  const slots = flowSlots(c, exclude);
  if (!slots.length) return 0;
  const kind = c.layout.kind;
  for (const s of slots) {
    const b = s.box;
    if (kind === 'vstack' && p.y < b.y + b.height / 2) return s.index;
    if (kind === 'hstack' && p.x < b.x + b.width / 2) return s.index;
    if (kind === 'grid' && (p.y < b.y || (p.y <= b.y + b.height && p.x < b.x + b.width / 2))) return s.index;
  }
  return slots[slots.length - 1].index + 1;
}

/**
 * The deepest stack / grid (or screen frame with a layout) under a document point, and the index a
 * node dropped there takes. `exclude`: nodes being dragged (they and their subtrees are not targets,
 * and the index is counted without them). Component instances, hidden and locked nodes are skipped.
 * Null when the point is on no layout (empty canvas, a free frame).
 */
export function layoutDropTarget(doc: DocLike, point: Vec, opts: { exclude?: readonly Id[] } = {}): LayoutDropTarget | null {
  const exclude = new Set(opts.exclude ?? []);
  const search = (nodes: readonly SceneNode[], parentM: Matrix): LayoutDropTarget | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type !== 'group' || n.component || !n.visible || n.locked || exclude.has(n.id)) continue;
      const m = multiply(parentM, fromTransform(n.transform));
      const local = apply(invert(m), point);
      if (n.screen) {
        if (!rectContains({ x: 0, y: 0, width: n.screen.width, height: n.screen.height }, local)) continue;
        // The frame is the target (when it lays out); content outside it is clipped.
        const inner = search(n.children, m);
        if (inner) return inner;
        return laysOut(n) ? { containerId: n.id, index: indexAt(n, local, exclude) } : null;
      }
      if (laysOut(n)) {
        if (!rectContains(containerRect(n), local)) continue;
        return search(n.children, m) ?? { containerId: n.id, index: indexAt(n, local, exclude) };
      }
      const inner = search(n.children, m);
      if (inner) return inner;
    }
    return null;
  };
  return search(doc.children, IDENTITY);
}

/**
 * The insertion line for a drop target, in document coordinates (a horizontal line between rows of
 * a vertical stack, a vertical one between items of a horizontal stack or grid).
 */
export function dropIndicator(doc: DocLike, target: LayoutDropTarget, exclude: readonly Id[] = []): { a: Vec; b: Vec } | null {
  const loc = locate(asDoc(doc), target.containerId);
  if (!loc || !laysOut(loc.node)) return null;
  const c = loc.node;
  const m = multiply(parentWorldMatrix(asDoc(doc), c.id), fromTransform(c.transform));
  const ex = new Set(exclude);
  const slots = flowSlots(c, ex);
  const r = containerRect(c);
  const p = c.layout.padding;
  const half = c.layout.gap / 2;
  const after = slots.filter((s) => s.index < target.index).pop();
  const before = slots.find((s) => s.index >= target.index);
  const line = (a: Vec, b: Vec) => ({ a: apply(m, a), b: apply(m, b) });
  if (c.layout.kind === 'vstack') {
    const y = before ? before.box.y - (after ? half : 0) : after ? after.box.y + after.box.height + half : p;
    return line({ x: p, y }, { x: r.width - p, y });
  }
  const ref = before ?? after;
  if (!ref) return line({ x: p, y: p }, { x: p, y: Math.max(p + 16, r.height - p) });
  const x = before ? before.box.x - (after && after.box.y === before.box.y ? half : 0) : ref.box.x + ref.box.width + half;
  return line({ x, y: ref.box.y }, { x, y: ref.box.y + ref.box.height });
}

/** Children list of a node id (null = the document root). */
function childrenOf(doc: DocLike, id: Id | null): SceneNode[] | null {
  if (id === null) return doc.children;
  const loc = locate(asDoc(doc), id);
  return loc && loc.node.type === 'group' ? loc.node.children : null;
}

/**
 * Inserts `node` (or several) into the container `containerId` at `index` (clamped; default: the
 * end). Mutates `doc` (a draft or a fresh copy); the layout step places them. Returns false when
 * the container is missing or does not lay out its children.
 */
export function insertIntoLayout(doc: DocLike, containerId: Id, node: SceneNode | SceneNode[], index?: number): boolean {
  const loc = locate(asDoc(doc), containerId);
  if (!loc || !laysOut(loc.node)) return false;
  const list = loc.node.children;
  const at = Math.max(0, Math.min(index ?? list.length, list.length));
  list.splice(at, 0, ...(Array.isArray(node) ? node : [node]));
  return true;
}

/** World matrix of a container (null = the document root). */
const worldOf = (doc: DocLike, id: Id | null): Matrix => {
  if (id === null) return IDENTITY;
  const loc = locate(asDoc(doc), id);
  return loc ? multiply(parentWorldMatrix(asDoc(doc), id), fromTransform(loc.node.transform)) : IDENTITY;
};

/** Takes `ids` out of their parents, keeping their world transforms relative to `toParent`. */
function detach(doc: DocLike, ids: readonly Id[], toParent: Id | null): SceneNode[] {
  const target = worldOf(doc, toParent);
  const out: SceneNode[] = [];
  for (const id of ids) {
    const loc = locate(asDoc(doc), id);
    if (!loc) continue;
    const parentM = parentWorldMatrix(asDoc(doc), id);
    const node = loc.node;
    const t = toTransform(multiply(invert(target), multiply(parentM, fromTransform(node.transform))));
    (loc.parent.children as SceneNode[]).splice(loc.index, 1);
    out.push({ ...node, transform: t } as SceneNode);
  }
  return out;
}

/** Ids in document order, without descendants of other ids in the list. */
function topmost(doc: DocLike, ids: readonly Id[]): Id[] {
  const set = new Set(ids);
  const out: Id[] = [];
  const visit = (nodes: readonly SceneNode[]) => {
    for (const n of nodes) {
      if (set.has(n.id)) out.push(n.id);
      else if (n.type === 'group') visit(n.children);
    }
  };
  visit(doc.children);
  return out;
}

/**
 * Moves `ids` into a stack at `target` (its index counted without them, as `layoutDropTarget`
 * returns it). Free children dropped into the flow join it. Mutates `doc`.
 */
export function moveIntoLayout(doc: DocLike, ids: readonly Id[], target: LayoutDropTarget): boolean {
  const order = topmost(doc, ids).filter((id) => id !== target.containerId);
  const cont = locate(asDoc(doc), target.containerId);
  if (!order.length || !cont || !laysOut(cont.node)) return false;
  if (order.some((id) => cont.ancestors.some((a) => a.id === id))) return false; // into itself
  const nodes = detach(doc, order, target.containerId).map((n) => {
    if (n.layoutItem?.position !== 'free') return n;
    const item = { ...n.layoutItem };
    delete item.position;
    return { ...n, layoutItem: item } as SceneNode;
  });
  return insertIntoLayout(doc, target.containerId, nodes, target.index);
}

/** The screen frame under a document point (topmost), or null. */
function frameAt(doc: DocLike, p: Vec): GroupNode | null {
  for (let i = doc.children.length - 1; i >= 0; i--) {
    const n = doc.children[i];
    if (!isScreenNode(n) || !n.visible) continue;
    const { x, y } = n.transform;
    if (rectContains({ x, y, width: n.screen.width, height: n.screen.height }, p)) return n;
  }
  return null;
}

/**
 * Takes `ids` out of every stack: each becomes a free child of the screen frame under `point` (its
 * own frame by default), keeping its position on the canvas; off every frame it goes to the canvas.
 */
export function moveOutOfLayout(doc: DocLike, ids: readonly Id[], point: Vec, opts: { free?: boolean } = {}): void {
  const order = topmost(doc, ids);
  if (!order.length) return;
  const frame = frameAt(doc, point);
  const nodes = detach(doc, order, frame?.id ?? null).map((n) => {
    if (!frame || !laysOut(frame) || opts.free === false) return n;
    return { ...n, layoutItem: { ...n.layoutItem, position: 'free' as const } } as SceneNode;
  });
  (childrenOf(doc, frame?.id ?? null) ?? doc.children).push(...nodes);
}

/** True when `ids` (topmost) share one parent and none of them is a screen frame. */
export function canWrap(doc: DocLike, ids: readonly Id[]): boolean {
  if (!doc.wireframe || !ids.length) return false;
  const locs = topmost(doc, ids).map((id) => locate(asDoc(doc), id));
  if (locs.some((l) => !l || isScreenNode(l.node))) return false;
  const parent = locs[0]!.parent;
  if (parent !== doc && (parent as GroupNode).component) return false;
  return locs.every((l) => l!.parent === parent);
}

/**
 * Object → Vertical stack / Horizontal stack / Grid: wraps `ids` (siblings) in a new container, in
 * their visual order (top to bottom; left to right for a horizontal stack). A selected screen frame
 * gets the layout itself (its content becomes a stack). Returns the container id, or null.
 */
export function wrapInLayout(doc: DocLike, ids: readonly Id[], kind: LayoutKind): Id | null {
  const top = topmost(doc, ids);
  if (top.length === 1) {
    const loc = locate(asDoc(doc), top[0]);
    if (loc && isScreenNode(loc.node)) {
      const g = loc.node as GroupNode;
      const base = g.layout ?? { ...defaultLayout(kind), padding: 16 };
      g.layout = { ...base, kind, ...(kind === 'grid' ? { columns: base.columns ?? 2 } : {}) };
      if (kind !== 'grid') delete g.layout.columns;
      return g.id;
    }
  }
  if (!canWrap(doc, top)) return null;
  const first = locate(asDoc(doc), top[0])!;
  const siblings = first.parent.children as SceneNode[];
  const index = Math.min(...top.map((id) => siblings.findIndex((n) => n.id === id)));
  const picked = top.map((id) => siblings.find((n) => n.id === id)!);
  const boxes = new Map(picked.map((n) => [n.id, childBox(n)]));
  const visual = [...picked].sort((a, b) => {
    const A = boxes.get(a.id)!;
    const B = boxes.get(b.id)!;
    if (kind === 'hstack') return A.x - B.x || A.y - B.y;
    if (kind === 'grid') return Math.abs(A.y - B.y) > Math.min(A.height, B.height) / 2 ? A.y - B.y : A.x - B.x;
    return A.y - B.y || A.x - B.x;
  });
  const all = unionRects(picked.map((n) => boxes.get(n.id)!)) ?? { x: 0, y: 0, width: 0, height: 0 };
  const layout = defaultLayout(kind);
  const container: GroupNode = {
    ...createGroup({ name: kind === 'hstack' ? 'Horizontal stack' : kind === 'grid' ? 'Grid' : 'Vertical stack', transform: { x: all.x, y: all.y } }),
    id: newId(),
    layout: { ...layout, size: { width: all.width, height: all.height } },
    children: visual.map((n) => ({ ...n, transform: { ...n.transform, x: n.transform.x - all.x, y: n.transform.y - all.y } })),
  };
  for (const n of picked) siblings.splice(siblings.indexOf(n), 1);
  siblings.splice(index, 0, container);
  return container.id;
}

/**
 * Object → Remove stack: the container's children take its place in its parent, where they are on
 * the canvas now. A screen frame keeps its children and loses its layout (free content). Returns the
 * children's ids, or null when `id` does not lay out its children.
 */
export function unwrapLayout(doc: DocLike, id: Id): Id[] | null {
  const loc = locate(asDoc(doc), id);
  if (!loc || !laysOut(loc.node)) return null;
  const c = loc.node as GroupNode;
  if (isScreenNode(c)) {
    delete c.layout;
    for (const ch of c.children) {
      if (ch.layoutItem?.position === 'free' || ch.layoutItem?.position === 'pinned-bottom') {
        const item = { ...ch.layoutItem };
        delete item.position;
        if (Object.keys(item).length) ch.layoutItem = item;
        else delete ch.layoutItem;
      }
    }
    return c.children.map((n) => n.id);
  }
  const m = fromTransform(c.transform);
  const kids = c.children.map((n) => {
    const out = { ...n, transform: toTransform(multiply(m, fromTransform(n.transform))) } as SceneNode;
    if (loc.parent === doc || !laysOut(loc.parent as GroupNode)) delete out.layoutItem;
    return out;
  });
  (loc.parent.children as SceneNode[]).splice(loc.index, 1, ...kids);
  return kids.map((n) => n.id);
}
