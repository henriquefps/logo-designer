// Node → path conversion (pure). Shapes keep their transform; groups are flattened in world space.
import {
  createPath,
  fromTransform,
  isPainted,
  multiply,
  nodeSubpaths,
  type Matrix,
  type PaintedNode,
  type PathNode,
  type SceneNode,
  type SubPath,
} from '@/model';
import { centerSubpaths, transformSubpaths } from './geometry';

/** Types that have a vector outline and can become a path. */
export const isShapeType = (n: SceneNode) => n.type === 'rect' || n.type === 'ellipse' || n.type === 'polygon';
export const hasOutline = (n: SceneNode) => isShapeType(n) || n.type === 'path';

/** Converts a rect/ellipse/polygon into an equivalent path node (same id, transform, paint). */
export function shapeToPath(node: SceneNode): PathNode | null {
  if (node.type === 'path') return node;
  if (!isShapeType(node) || !isPainted(node)) return null;
  const sp = nodeSubpaths(node)!;
  return {
    ...createPath({ subpaths: structuredClone(sp), fill: node.fill, stroke: node.stroke }),
    id: node.id,
    name: node.name,
    visible: node.visible,
    locked: node.locked,
    opacity: node.opacity,
    ...(node.blendMode ? { blendMode: node.blendMode } : {}),
    transform: { ...node.transform },
  };
}

/** Converts shapes inside a node tree into paths (groups recurse). Returns the same object when nothing changed. */
export function convertTree(node: SceneNode): SceneNode {
  if (node.type === 'group') {
    const children = node.children.map(convertTree);
    return children.every((c, i) => c === node.children[i]) ? node : { ...node, children };
  }
  return isShapeType(node) ? (shapeToPath(node) ?? node) : node;
}

export interface WorldShape {
  subpaths: SubPath[];
  fillRule: 'nonzero' | 'evenodd';
  source: PaintedNode;
}

/**
 * Outlines of a node in world space (`parentWorld` maps its parent to world). Groups contribute every
 * visible descendant with an outline. Text and images are skipped.
 */
export function worldShapes(node: SceneNode, parentWorld: Matrix): WorldShape[] {
  if (!node.visible) return [];
  const m = multiply(parentWorld, fromTransform(node.transform));
  if (node.type === 'group') return node.children.flatMap((c) => worldShapes(c, m));
  if (!hasOutline(node) || !isPainted(node)) return [];
  const sp = nodeSubpaths(node)!;
  return [{ subpaths: transformSubpaths(sp, m), fillRule: node.type === 'path' ? node.fillRule : 'nonzero', source: node }];
}

/** True if the node (or any descendant) has an outline that boolean ops can use. */
export function isBooleanOperand(node: SceneNode): boolean {
  if (node.type === 'group') return node.children.some(isBooleanOperand);
  return hasOutline(node);
}

/** First painted leaf with an outline, depth-first, bottom-most first (for "keeps the bottom item's style"). */
export function bottomStyleSource(node: SceneNode): PaintedNode | null {
  if (node.type === 'group') {
    for (const c of node.children) {
      const s = bottomStyleSource(c);
      if (s) return s;
    }
    return null;
  }
  return hasOutline(node) && isPainted(node) ? node : null;
}

/**
 * Builds a path node from world-space subpaths placed inside a parent whose world matrix inverse is
 * `toParent`. The node's origin is the center of its bounds (identity rotation/scale).
 */
export function pathFromWorld(subpaths: SubPath[], toParent: Matrix, init: Parameters<typeof createPath>[0] = {}): PathNode {
  const local = transformSubpaths(subpaths, toParent);
  const { subpaths: centered, center } = centerSubpaths(local);
  return createPath({ ...init, subpaths: centered, transform: { x: center.x, y: center.y } });
}

/** Re-centers a path node's origin on its geometry bounds without moving it visually. */
export function recenterPath(node: PathNode): PathNode {
  const { subpaths, center } = centerSubpaths(node.subpaths);
  if (Math.abs(center.x) < 1e-9 && Math.abs(center.y) < 1e-9) return node;
  const m = fromTransform(node.transform);
  // New origin in parent space = old transform applied to the old local center.
  const x = m.a * center.x + m.c * center.y + m.e;
  const y = m.b * center.x + m.d * center.y + m.f;
  return { ...node, subpaths, transform: { ...node.transform, x, y } };
}
