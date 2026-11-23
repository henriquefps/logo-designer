// Stacks and grids of wireframe documents (docs/wireframe-mode.md → Layout: stacks and grids).
//
// A container is a group with `layout: { kind, gap, padding, align, columns? }` (a screen frame
// can be one: its content is then a stack). Its local origin is its top-left corner. Children are
// placed in the flow unless `layoutItem.position` says otherwise:
//   - `free`: absolute, ignored by the flow (FAB, modal, badge);
//   - `pinned-bottom` (direct children of a screen frame only; elsewhere it is `flow`): stacked at
//     the bottom of the frame, which is max(platform minimum, content) tall, across the full frame
//     width (bars are edge to edge, the frame's padding does not apply to them).
// Sizes (`layoutItem.width/height`, defaults from the component definition's `sizing`; containers
// fill × hug; plain shapes and groups always hug their bounds and are only moved):
//   - a number: fixed;
//   - `hug`: the content (a component's build height; the width its build reports, else its default width);
//   - `bleed` (edge to edge; default from the component's `sizing.bleed`): the child ignores the
//     padding on the cross axis (vstack: horizontal, hstack: vertical; grids ignore it);
//   - `fill`: main axis: shares the space left (vstack: grows from its hug height, only when the
//     container is taller than its content, e.g. a screen's minimum height); cross axis: the
//     container's inner size. `align: stretch` makes hugging children fill the cross axis.
//
// Two passes, both pure: `plan*` measures plain nodes (memoized on node identity: immer's
// structural sharing keeps untouched subtrees the same objects, so measuring them again is a cache
// hit), `applyLayout` writes the plan into an immer draft (transforms, container sizes, component
// rebuilds through `env.build`) and never assigns an equal value. Running it twice changes nothing.
import type { Draft } from 'immer';
import { boundsIn, fromTransform, type GroupNode, type LayoutInfo, type LayoutItemInfo, type LayoutSize, type SceneNode, type ScreenPlatform } from '@/model';
import { getComponent } from './library/registry';
import { resizableAxes, resolveProps } from './library/types';
import { EMPTY_CONTAINER } from './containers';

export const EPS = 1e-6;

export type ContainerNode = GroupNode & { layout: LayoutInfo };

export const isLayoutContainer = (n: SceneNode): n is ContainerNode => n.type === 'group' && !!n.layout && !n.component;

/** Default layout of a new stack / grid made with Object → Vertical stack / Horizontal stack / Grid. */
export function defaultLayout(kind: LayoutInfo['kind']): LayoutInfo {
  switch (kind) {
    case 'hstack':
      return { kind, gap: 8, padding: 0, align: 'center' };
    case 'grid':
      return { kind, gap: 12, padding: 0, align: 'stretch', columns: 2 };
    default:
      return { kind: 'vstack', gap: 12, padding: 0, align: 'stretch' };
  }
}

/**
 * Layout of a new screen frame: its content is a vertical stack. Padding and gap grow with the
 * platform (phone 16 / 12, tablet 24 / 16, desktop 32 / 24); children align to the start (most
 * components fill the width anyway; hugging ones such as a text button sit on the left).
 */
export function defaultScreenLayout(platform: ScreenPlatform): LayoutInfo {
  if (platform === 'desktop') return { kind: 'vstack', gap: 24, padding: 32, align: 'start' };
  if (platform === 'tablet') return { kind: 'vstack', gap: 16, padding: 24, align: 'start' };
  return { kind: 'vstack', gap: 12, padding: 16, align: 'start' };
}

export type Position = NonNullable<LayoutItemInfo['position']>;

/** How a child sits in its container: the sizes, position and bleed after defaults. */
export function itemSizing(n: SceneNode): { width: LayoutSize; height: LayoutSize; position: Position; bleed: boolean } {
  const item = n.layoutItem ?? {};
  const position = item.position ?? 'flow';
  if (n.type === 'group' && n.component) {
    const def = getComponent(n.component.kind);
    const base: { width: LayoutSize; height: LayoutSize; bleed?: boolean } = def?.sizing ?? { width: 'hug', height: 'hug' };
    // An axis the definition cannot be sized in ignores whatever was set for it (an old file, a pasted size): it follows the content.
    const axes = def ? resizableAxes(def) : { width: true, height: true };
    return {
      width: axes.width ? (item.width ?? base.width) : base.width === 'fill' ? 'hug' : base.width,
      height: axes.height ? (item.height ?? base.height) : 'hug',
      position,
      bleed: item.bleed ?? base.bleed ?? false,
    };
  }
  if (isLayoutContainer(n)) return { width: item.width ?? 'fill', height: item.height ?? 'hug', position, bleed: item.bleed ?? false };
  return { width: 'hug', height: 'hug', position, bleed: item.bleed ?? false };
}

/** The axes a child can be sized in: a component's declared ones, everything else both. */
function childAxes(n: SceneNode): { width: boolean; height: boolean } {
  const def = n.type === 'group' && n.component ? getComponent(n.component.kind) : undefined;
  return def ? resizableAxes(def) : { width: true, height: true };
}

/** The cross-axis alignment of a child: its own `alignSelf`, else the container's `align`. */
export const alignOf = (n: SceneNode, align: LayoutInfo['align']): LayoutInfo['align'] => n.layoutItem?.alignSelf ?? align;

/** Whether the child takes the row's / cell's height (fill, or hug under `stretch`): never for one whose height follows its content. */
const takesRowHeight = (n: SceneNode, s: { height: LayoutSize }, align: LayoutInfo['align']) =>
  !isPlain(n) && childAxes(n).height && (s.height === 'fill' || (s.height === 'hug' && alignOf(n, align) === 'stretch'));

/** Height of a child with a fixed height: a component never gets shorter than its content (its `minHeight`, else its hug height). */
const fixedHeight = (n: SceneNode, h: number, w: number) => (n.type === 'group' && n.component ? Math.max(h, minComponentHeight(n as Parameters<typeof componentHeight>[0], w)) : h);

/** The shortest height a component can be given at `width`: its definition's `minHeight`, else its hug height. */
function minComponentHeight(c: GroupNode & { component: NonNullable<GroupNode['component']> }, width: number): number {
  const def = getComponent(c.component.kind);
  if (!def?.minHeight) return componentHeight(c, width);
  try {
    return def.minHeight(resolveProps(def, c.component.props as Record<string, unknown>, c.component.resolved), { width });
  } catch {
    return componentHeight(c, width);
  }
}

/** Plain shapes and groups keep their size: the layout only moves them. */
const isPlain = (n: SceneNode) => !(n.type === 'group' && (n.component || isLayoutContainer(n)));

const ZERO = { x: 0, y: 0, width: 0, height: 0 };
/** Box of a child in its parent's space (where its transform puts it). */
export const childBox = (n: SceneNode) => boundsIn(n, fromTransform(n.transform)) ?? { ...ZERO, x: n.transform.x, y: n.transform.y };

// ---------- measuring (pure, memoized) ----------

const heightCache = new WeakMap<object, Map<number, number>>();
const widthCache = new WeakMap<object, number>();
const hugWidthCache = new WeakMap<object, Map<number, number>>();
const planCache = new WeakMap<object, Map<string, Plan>>();

function memo<K extends object, V>(cache: WeakMap<K, Map<number | string, V>>, key: K, sub: number | string, f: () => V): V {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = new Map()));
  let v = m.get(sub);
  if (v === undefined) m.set(sub, (v = f()));
  return v;
}

/** A component's build height at `width` (memoized on its `component` object). */
function componentHeight(c: GroupNode & { component: NonNullable<GroupNode['component']> }, width: number): number {
  const info = c.component;
  return memo(heightCache as WeakMap<object, Map<number | string, number>>, info, width, () => {
    const def = getComponent(info.kind);
    if (!def) return info.size?.height ?? childBox(c).height;
    try {
      return def.build(resolveProps(def, info.props as Record<string, unknown>, info.resolved), { width }).height;
    } catch {
      return info.size?.height ?? def.defaultSize.height; // a broken component keeps its box
    }
  });
}

/** Width the node takes when it hugs its content. */
export function hugWidth(n: SceneNode): number {
  if (isPlain(n)) return childBox(n).width;
  if (n.type === 'group' && n.component) {
    const info = n.component;
    const def = getComponent(info.kind);
    if (!def) return info.size?.width ?? childBox(n).width;
    // The width its content needs (a button's label + padding), else its default width.
    return memo(hugWidthCache as WeakMap<object, Map<number | string, number>>, info, 0, () => {
      try {
        return def.build(resolveProps(def, info.props as Record<string, unknown>, info.resolved), { width: def.defaultSize.width }).width ?? def.defaultSize.width;
      } catch {
        return def.defaultSize.width;
      }
    });
  }
  const c = n as ContainerNode;
  const cached = widthCache.get(c);
  if (cached !== undefined) return cached;
  const { padding: p, gap: g } = c.layout;
  if (!c.screen && !flowChildren(c, false).length) {
    // An empty stack keeps a minimum size, so it can be seen and dropped onto.
    const empty = Math.max(EMPTY_CONTAINER.width, 2 * p);
    widthCache.set(c, empty);
    return empty;
  }
  const ws = flowChildren(c, false).map(basisWidth);
  let w: number;
  if (c.layout.kind === 'hstack') w = ws.reduce((a, b) => a + b, 0) + g * Math.max(0, ws.length - 1);
  else if (c.layout.kind === 'grid') {
    const cols = gridColumns(c.layout);
    w = cols * Math.max(0, ...ws) + g * (cols - 1);
  } else {
    // vstack: edge-to-edge children span the padding too.
    const flow = flowChildren(c, false);
    const inner = flow.filter((n) => !itemSizing(n).bleed).map(basisWidth);
    const bleed = flow.filter((n) => itemSizing(n).bleed).map(basisWidth);
    w = Math.max(inner.length ? Math.max(...inner) + 2 * p : 2 * p, ...bleed);
    widthCache.set(c, w);
    return w;
  }
  w += 2 * p;
  widthCache.set(c, w);
  return w;
}

/** Width a child asks for before any filling: fixed, else its hug width. */
const basisWidth = (n: SceneNode) => {
  const s = itemSizing(n);
  return !isPlain(n) && typeof s.width === 'number' ? s.width : hugWidth(n);
};

/** Height the node takes at `width` when it hugs its content. */
export function hugHeight(n: SceneNode, width: number): number {
  if (isPlain(n)) return childBox(n).height;
  if (n.type === 'group' && n.component) return componentHeight(n as Parameters<typeof componentHeight>[0], width);
  return planContainer(n as ContainerNode, { width }).height;
}

export const gridColumns = (l: LayoutInfo) => Math.max(1, Math.round(l.columns ?? 2));

function flowChildren(c: ContainerNode, pinnedAllowed: boolean): SceneNode[] {
  return c.children.filter((n) => n.visible && itemSizing(n).position !== 'free' && !(pinnedAllowed && itemSizing(n).position === 'pinned-bottom'));
}

// ---------- planning ----------

/** The box a container is laid out in: width always; a fixed height, or a minimum it grows from. */
export interface LayoutBox {
  width: number;
  height?: number;
  minHeight?: number;
  /** A screen frame: `pinned-bottom` children are pinned. */
  frame?: boolean;
}

export interface PlanItem {
  /** Index in the container's `children`. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Plan {
  width: number;
  height: number;
  items: PlanItem[];
}

interface Measured {
  index: number;
  node: SceneNode;
  w: number;
  h: number;
  fillW: boolean;
  fillH: boolean;
  plain: boolean;
}

/** Where the first child starts and the distance from one child's start to the next's end (the gap, or more for `space-between`). */
function distribute(justify: LayoutInfo['justify'], free: number, n: number, gap: number): { start: number; step: number } {
  if (free <= EPS || n === 0) return { start: 0, step: gap };
  if (justify === 'center') return { start: free / 2, step: gap };
  if (justify === 'end') return { start: free, step: gap };
  if (justify === 'space-between' && n > 1) return { start: 0, step: gap + free / (n - 1) };
  return { start: 0, step: gap };
}

function crossOffset(align: LayoutInfo['align'], space: number, size: number): number {
  if (align === 'center') return (space - size) / 2;
  if (align === 'end') return space - size;
  return 0;
}

/** Lays out `c`'s children in `box` (pure; memoized on the node and the box). */
export function planContainer(c: ContainerNode, box: LayoutBox): Plan {
  const key = `${box.width}|${box.height ?? ''}|${box.minHeight ?? ''}|${box.frame ? 1 : 0}`;
  return memo(planCache as WeakMap<object, Map<number | string, Plan>>, c, key, () => computePlan(c, box));
}

function computePlan(c: ContainerNode, box: LayoutBox): Plan {
  const L = c.layout;
  const p = L.padding;
  const g = L.gap;
  const W = box.width;
  const iw = Math.max(0, W - 2 * p);
  const indexOf = new Map(c.children.map((n, i) => [n, i]));
  const flow = flowChildren(c, !!box.frame);
  const items: PlanItem[] = [];

  // Pinned-bottom children of a frame: full width, stacked at the bottom.
  const pinned = box.frame ? c.children.filter((n) => n.visible && itemSizing(n).position === 'pinned-bottom') : [];
  const pinnedM = pinned.map((n) => ({ ...measure(n, W, W, L.align), index: indexOf.get(n)! }));
  const pinnedTotal = pinnedM.reduce((a, m) => a + m.h, 0);

  if (!box.frame && !c.screen && !flow.length) {
    // An empty stack: the minimum size (its placeholder on the canvas), unless it is given a height.
    return { width: W, height: box.height ?? Math.max(box.minHeight ?? 0, EMPTY_CONTAINER.height, 2 * p), items: [] };
  }

  const placePinned = (H: number) => {
    let y = H - pinnedTotal;
    for (const m of pinnedM) {
      items.push({ index: m.index, x: crossOffset(L.align, W, m.w), y, width: m.w, height: m.h });
      y += m.h;
    }
  };

  if (L.kind === 'hstack') {
    const ms = flow.map((n) => {
      const s = itemSizing(n);
      const plain = isPlain(n);
      const fillW = !plain && s.width === 'fill';
      const w = plain ? childBox(n).width : typeof s.width === 'number' ? s.width : fillW ? 0 : hugWidth(n);
      return { index: indexOf.get(n)!, node: n, w, h: 0, fillW, fillH: false, plain } as Measured;
    });
    const fills = ms.filter((m) => m.fillW);
    if (fills.length) {
      const used = ms.reduce((a, m) => a + (m.fillW ? 0 : m.w), 0) + g * Math.max(0, ms.length - 1);
      const share = Math.max(0, iw - used) / fills.length;
      for (const m of fills) m.w = share;
    }
    for (const m of ms) {
      const s = itemSizing(m.node);
      m.h = m.plain ? childBox(m.node).height : typeof s.height === 'number' ? fixedHeight(m.node, s.height, m.w) : hugHeight(m.node, m.w);
      m.fillH = takesRowHeight(m.node, s, L.align);
    }
    let ih = box.height !== undefined ? Math.max(0, box.height - 2 * p) : Math.max(0, ...ms.map((m) => m.h));
    if (box.height === undefined && box.minHeight !== undefined) ih = Math.max(ih, box.minHeight - 2 * p - pinnedTotal);
    // Main axis: the room left in the row is placed by `justify` (none while a child fills).
    const free = Math.max(0, iw - ms.reduce((a, m) => a + m.w, 0) - g * Math.max(0, ms.length - 1));
    const { start, step } = distribute(L.justify, free, ms.length, g);
    let x = p + start;
    for (const m of ms) {
      // Edge to edge: the cross axis is the full height (no vertical padding).
      const bleed = itemSizing(m.node).bleed;
      const space = bleed ? ih + 2 * p : ih;
      const h = m.fillH ? space : m.h;
      items.push({ index: m.index, x, y: (bleed ? 0 : p) + crossOffset(alignOf(m.node, L.align), space, h), width: m.w, height: h });
      x += m.w + step;
    }
    const H = box.height ?? Math.max(box.minHeight ?? 0, ih + 2 * p + pinnedTotal);
    placePinned(H);
    return { width: W, height: H, items: sortItems(items) };
  }

  if (L.kind === 'grid') {
    const cols = gridColumns(L);
    const cellW = Math.max(0, (iw - g * (cols - 1)) / cols);
    const ms = flow.map((n) => ({ ...measure(n, cellW, cellW, L.align), index: indexOf.get(n)! }));
    let y = p;
    for (let r = 0; r * cols < ms.length; r++) {
      const row = ms.slice(r * cols, r * cols + cols);
      const rowH = Math.max(0, ...row.map((m) => m.h));
      row.forEach((m, col) => {
        const s = itemSizing(m.node);
        const h = takesRowHeight(m.node, s, L.align) ? rowH : m.h;
        items.push({ index: m.index, x: p + col * (cellW + g) + crossOffset(alignOf(m.node, L.align), cellW, m.w), y, width: m.w, height: h });
      });
      y += rowH + g;
    }
    const content = ms.length ? y - g - p : 0;
    const H = box.height ?? Math.max(box.minHeight ?? 0, content + 2 * p + pinnedTotal);
    placePinned(H);
    return { width: W, height: H, items: sortItems(items) };
  }

  // vstack
  // Edge-to-edge children measure against the full width (no horizontal padding).
  const ms = flow.map((n) => {
    const space = itemSizing(n).bleed ? W : iw;
    return { ...measure(n, space, space, L.align), index: indexOf.get(n)! };
  });
  const content = ms.reduce((a, m) => a + m.h, 0) + g * Math.max(0, ms.length - 1);
  const H = box.height ?? Math.max(box.minHeight ?? 0, content + 2 * p + pinnedTotal);
  const fills = ms.filter((m) => m.fillH);
  const extra = H - pinnedTotal - 2 * p - content;
  if (fills.length && extra > EPS) for (const m of fills) m.h += extra / fills.length;
  // Main axis: the height left (a screen's minimum height, a fixed height) is placed by `justify`.
  const left = Math.max(0, H - pinnedTotal - 2 * p - ms.reduce((a, m) => a + m.h, 0) - g * Math.max(0, ms.length - 1));
  const { start, step } = distribute(L.justify, left, ms.length, g);
  let y = p + start;
  for (const m of ms) {
    const a = alignOf(m.node, L.align);
    const x = itemSizing(m.node).bleed ? crossOffset(a, W, m.w) : p + crossOffset(a, iw, m.w);
    items.push({ index: m.index, x, y, width: m.w, height: m.h });
    y += m.h + step;
  }
  placePinned(H);
  return { width: W, height: H, items: sortItems(items) };
}

const sortItems = (items: PlanItem[]) => items.sort((a, b) => a.index - b.index);

/** Size of a child in a column of width `space` (vstack, grid cell, pinned bar); `fillTo` = what fill/stretch take. */
function measure(n: SceneNode, space: number, fillTo: number, align: LayoutInfo['align']): Measured {
  const s = itemSizing(n);
  const plain = isPlain(n);
  if (plain) {
    const b = childBox(n);
    return { index: -1, node: n, w: b.width, h: b.height, fillW: false, fillH: false, plain };
  }
  const w = typeof s.width === 'number' ? s.width : s.width === 'fill' || (alignOf(n, align) === 'stretch' && childAxes(n).width) ? fillTo : Math.min(hugWidth(n), space);
  const h = typeof s.height === 'number' ? fixedHeight(n, s.height, w) : hugHeight(n, w);
  return { index: -1, node: n, w, h, fillW: s.width === 'fill', fillH: s.height === 'fill', plain };
}

// ---------- applying ----------

export interface LayoutEnv {
  /** Rebuilds a component instance at this size (the components step's `buildComponentInto`). */
  build(node: Draft<GroupNode>, size: { width: number; height?: number }): void;
  /** True when this plain node (and its subtree) is unchanged since the last layout run: skip it if its size is the same. */
  fresh(node: SceneNode): boolean;
  /** True when a component instance's children are up to date (its `component` did not change, not a load). */
  built(node: SceneNode): boolean;
  /** True when the layout must not move this child now (it is being dragged). */
  hold(node: SceneNode): boolean;
}

const near = (a: number, b: number) => Math.abs(a - b) <= EPS;

/**
 * Lays out the container `draft` (whose plain snapshot is `node`) in `box` and writes the result.
 * Returns the container's size.
 */
export function applyLayout(draft: Draft<ContainerNode>, node: ContainerNode, box: LayoutBox, env: LayoutEnv): { width: number; height: number } {
  const plan = planContainer(node, box);
  if (!box.frame) {
    const cur = node.layout.size;
    if (!cur || !near(cur.width, plan.width) || !near(cur.height, plan.height)) draft.layout.size = { width: plan.width, height: plan.height };
  }
  for (const it of plan.items) {
    const child = node.children[it.index];
    const d = draft.children[it.index] as Draft<SceneNode>;
    placeChild(d, child, it, env);
  }
  return { width: plan.width, height: plan.height };
}

function placeChild(d: Draft<SceneNode>, child: SceneNode, it: PlanItem, env: LayoutEnv) {
  if (!env.hold(child)) {
    if (isPlain(child)) {
      const b = childBox(child);
      const dx = it.x - b.x;
      const dy = it.y - b.y;
      if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) d.transform = { ...child.transform, x: child.transform.x + dx, y: child.transform.y + dy };
    } else {
      const t = child.transform;
      if (!near(t.x, it.x) || !near(t.y, it.y) || t.rotation !== 0 || t.scaleX !== 1 || t.scaleY !== 1) d.transform = { x: it.x, y: it.y, rotation: 0, scaleX: 1, scaleY: 1 };
    }
  }
  if (child.type !== 'group') return;
  if (child.component) {
    const size = child.component.size;
    if (!size || !near(size.width, it.width) || !near(size.height, it.height) || !env.built(child)) {
      const hug = hugHeight(child, it.width);
      env.build(d as Draft<GroupNode>, near(hug, it.height) ? { width: it.width } : { width: it.width, height: it.height });
    }
    return;
  }
  if (isLayoutContainer(child)) {
    const size = child.layout.size;
    if (size && env.fresh(child) && near(size.width, it.width) && near(size.height, it.height)) return;
    const hug = hugHeight(child, it.width);
    applyLayout(d as Draft<ContainerNode>, child, near(hug, it.height) ? { width: it.width } : { width: it.width, height: it.height }, env);
  }
}

/** Box a container that is not inside a flow (top level, free, in a free frame) is laid out in. */
export function rootBox(c: ContainerNode): LayoutBox {
  const s = c.layoutItem ?? {};
  const width = typeof s.width === 'number' ? s.width : (c.layout.size?.width ?? hugWidth(c));
  return typeof s.height === 'number' ? { width, height: s.height } : { width };
}
