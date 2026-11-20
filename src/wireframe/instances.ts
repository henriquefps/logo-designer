// Component instances: creating one, where a new one goes inside a screen, Detach. Pure (the app's
// commands in ./componentCommands.ts and the tests use it).
import type { Draft } from 'immer';
import { createGroup, isComponentNode, platformDef, type ComponentNode, type GroupNode, type LayoutItemInfo, type SceneNode, type Vec } from '@/model';
import type { AnyComponentDef } from './library/types';
import { initialProps, resolveProps } from './library/types';
import { contentBottom } from './screens';

/** Space around content placed freely in a frame (until the frame has a stack layout). */
export const FREE_MARGIN = 24;
export const FREE_GAP = 16;

/** A new instance of `def` (children empty: the pipeline builds them). `at` = top-left in the parent's space. */
export function newInstance(def: AnyComponentDef, at: Vec, width = def.defaultSize.width, props: Record<string, unknown> = initialProps(def)): ComponentNode {
  return {
    ...createGroup({ name: def.label, transform: { x: Math.round(at.x), y: Math.round(at.y) } }),
    component: { kind: def.kind, props: structuredClone(props), size: { width: Math.round(width), height: def.defaultSize.height } },
  } as ComponentNode;
}

/**
 * Width of a new instance inside a container `containerWidth` wide: `fill` components take the
 * width minus the margins (edge to edge when their default width is at least a phone's, like list
 * rows); others keep their default width.
 */
export function insertWidth(def: AnyComponentDef, containerWidth: number): { x: number; width: number } {
  if (def.sizing.width !== 'fill') return { x: FREE_MARGIN, width: Math.min(def.defaultSize.width, containerWidth) };
  if (def.defaultSize.width >= platformDef('phone').width) return { x: 0, width: containerWidth };
  return { x: FREE_MARGIN, width: Math.max(1, containerWidth - FREE_MARGIN * 2) };
}

/** Where "append" puts a new instance in a container laid out freely: below everything, at the margin. */
export function appendPosition(def: AnyComponentDef, container: GroupNode, containerWidth: number): { x: number; y: number; width: number } {
  const { x, width } = insertWidth(def, containerWidth);
  const bottom = container.children.length ? contentBottom(container) : 0;
  return { x, y: bottom ? bottom + FREE_GAP : FREE_MARGIN, width };
}

/**
 * Where a drop at `p` (container space) puts a new instance: `fill` components span the container
 * at the drop height; others are centred on the pointer. The top-left is kept inside the container.
 */
export function dropPosition(def: AnyComponentDef, p: Vec, containerWidth: number): { x: number; y: number; width: number } {
  const { x, width } = insertWidth(def, containerWidth);
  const h = def.defaultSize.height;
  const left = def.sizing.width === 'fill' ? x : p.x - width / 2;
  return { x: Math.max(0, Math.min(left, containerWidth - width)), y: Math.max(0, p.y - h / 2), width };
}

/** Detach: the instance becomes a plain group of its shapes (in place, same id, same children). */
export function detachInstance(node: Draft<SceneNode>): boolean {
  if (node.type !== 'group' || !node.component) return false;
  delete node.component;
  return true;
}

/** True when `id` is a generated child of an instance (somewhere under a `component` group). */
export function isGeneratedChild(path: readonly SceneNode[]): boolean {
  return path.some((a) => isComponentNode(a));
}

/** Margins of default-placed pieces (snackbar sides, FAB right edge, bottom distance of free ones). */
export const PLACE_SIDE = 16;
export const PLACE_BOTTOM = 24;

/**
 * Where and how big a new instance goes on a screen when its definition has a `placement` (null:
 * no default, use the usual flow insert). `layoutItem` is what to store next to it (free / pinned);
 * `at` is the top-left in the frame (free ones are absolute; pinned ones are placed by the layout).
 * A frame without a stack layout keeps free content, so pinned pieces are just put at the bottom.
 * `inset` = height of the bars already pinned to the bottom: free pieces anchored near the bottom (FAB,
 * snackbar) sit above them.
 */
export function defaultPlacement(
  def: AnyComponentDef,
  props: Record<string, unknown>,
  frame: { width: number; height: number; layout: boolean; inset?: number },
): { at: Vec; width: number; layoutItem?: LayoutItemInfo } | null {
  const pl = def.placement;
  if (!pl) return null;
  const build = (width: number) => {
    try {
      return def.build(resolveProps(def, props), { width });
    } catch {
      return { children: [], height: def.defaultSize.height, width: undefined };
    }
  };
  if (pl.position === 'pinned-bottom') {
    const height = build(frame.width).height;
    return frame.layout ? { at: { x: 0, y: 0 }, width: frame.width, layoutItem: { position: 'pinned-bottom' } } : { at: { x: 0, y: Math.max(0, frame.height - height) }, width: frame.width };
  }
  const maxW = Math.max(1, frame.width);
  const width = {
    'bottom-right': () => Math.min(build(def.defaultSize.width).width ?? def.defaultSize.width, maxW),
    bottom: () => Math.max(1, maxW - PLACE_SIDE * 2),
    'bottom-edge': () => maxW,
    center: () => Math.min(def.defaultSize.width, Math.max(1, maxW - FREE_MARGIN * 2)),
  }[pl.anchor]();
  const height = build(width).height;
  const floor = frame.height - (frame.inset ?? 0) - PLACE_BOTTOM;
  const at = {
    'bottom-right': { x: frame.width - PLACE_SIDE - width, y: floor - height },
    bottom: { x: PLACE_SIDE, y: floor - height },
    'bottom-edge': { x: 0, y: frame.height - height },
    center: { x: (frame.width - width) / 2, y: (frame.height - height) / 2 },
  }[pl.anchor];
  return { at: { x: Math.max(0, at.x), y: Math.max(0, at.y) }, width, layoutItem: { position: 'free' } };
}
