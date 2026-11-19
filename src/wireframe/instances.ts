// Component instances: creating one, where a new one goes inside a screen, Detach. Pure (the app's
// commands in ./componentCommands.ts and the tests use it).
import type { Draft } from 'immer';
import { createGroup, isComponentNode, platformDef, type ComponentNode, type GroupNode, type SceneNode, type Vec } from '@/model';
import type { AnyComponentDef } from './library/types';
import { defaultProps } from './library/types';
import { contentBottom } from './screens';

/** Space around content placed freely in a frame (until the frame has a stack layout). */
export const FREE_MARGIN = 24;
export const FREE_GAP = 16;

/** A new instance of `def` (children empty: the pipeline builds them). `at` = top-left in the parent's space. */
export function newInstance(def: AnyComponentDef, at: Vec, width = def.defaultSize.width, props: Record<string, unknown> = defaultProps(def)): ComponentNode {
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
