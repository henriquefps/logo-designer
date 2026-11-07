import { apply, IDENTITY, multiply, fromTransform, type Matrix } from './matrix';
import { cubicExtrema, cubicAt, nodeSubpaths } from './path';
import { locate } from './tree';
import type { DesignDocument, Id, Rect, SceneNode, SubPath, TextNode, Vec } from './types';

export type TextMeasurer = (node: TextNode) => { width: number; height: number; lineWidths: number[] };

/** Rough fallback until the fonts module installs a real measurer via setTextMeasurer(). */
const approxMeasurer: TextMeasurer = (node) => {
  const lines = node.text.split('\n');
  const lineWidths = lines.map((l) => l.length * node.fontSize * 0.56 + Math.max(0, l.length - 1) * node.letterSpacing);
  return {
    width: Math.max(0, ...lineWidths),
    height: lines.length * node.fontSize * node.lineHeight,
    lineWidths,
  };
};

let textMeasurer: TextMeasurer = approxMeasurer;
/** Extension point for the fonts/text module: plug accurate text metrics in. */
export function setTextMeasurer(m: TextMeasurer | null) {
  textMeasurer = m ?? approxMeasurer;
}
export const measureText = (node: TextNode) => textMeasurer(node);

export const emptyRect = (): Rect => ({ x: 0, y: 0, width: 0, height: 0 });

export function rectFromPoints(points: Vec[]): Rect | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionRects(rects: (Rect | null)[]): Rect | null {
  const pts: Vec[] = [];
  for (const r of rects) if (r) pts.push({ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height });
  return rectFromPoints(pts);
}

export const rectCorners = (r: Rect): Vec[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

export const rectCenter = (r: Rect): Vec => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export function subpathsBounds(subpaths: SubPath[]): Rect | null {
  const pts: Vec[] = [];
  for (const sp of subpaths) {
    const p = sp.points;
    if (!p.length) continue;
    pts.push(p[0]);
    const segCount = sp.closed ? p.length : p.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      pts.push(b);
      if (!a.out && !b.in) continue;
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      const ts = [...cubicExtrema(a.x, c1.x, c2.x, b.x), ...cubicExtrema(a.y, c1.y, c2.y, b.y)];
      for (const t of ts) pts.push(cubicAt(a, c1, c2, b, t));
    }
  }
  return rectFromPoints(pts);
}

export function textLocalBounds(node: TextNode): Rect {
  const { width, height } = measureText(node);
  const x = node.align === 'left' ? 0 : node.align === 'center' ? -width / 2 : -width;
  return { x, y: 0, width, height };
}

/**
 * Bounding box of the node's geometry in its own local coordinates (before its transform).
 * Groups return the union of their children's boxes in the group's local space. Stroke width is ignored.
 */
export function localBounds(node: SceneNode): Rect | null {
  switch (node.type) {
    case 'rect':
      return { x: -node.width / 2, y: -node.height / 2, width: node.width, height: node.height };
    case 'image':
      return { x: -node.width / 2, y: -node.height / 2, width: node.width, height: node.height };
    case 'ellipse':
      return { x: -node.rx, y: -node.ry, width: node.rx * 2, height: node.ry * 2 };
    case 'text':
      return textLocalBounds(node);
    case 'group':
      return unionRects(node.children.filter((c) => c.visible).map((c) => boundsIn(c, fromTransform(c.transform))));
    default: {
      const sp = nodeSubpaths(node);
      return sp ? subpathsBounds(sp) : null;
    }
  }
}

/** Axis-aligned box of the node after applying matrix `m` to its local geometry. */
export function boundsIn(node: SceneNode, m: Matrix): Rect | null {
  if (node.type === 'group') {
    return unionRects(node.children.filter((c) => c.visible).map((c) => boundsIn(c, multiply(m, fromTransform(c.transform)))));
  }
  if (node.type === 'path' || node.type === 'polygon' || node.type === 'ellipse' || (node.type === 'rect' && node.radius > 0)) {
    // Transform the geometry (tight box even when rotated).
    const sp = nodeSubpaths(node);
    if (!sp) return null;
    const transformed = sp.map((s) => ({
      closed: s.closed,
      points: s.points.map((p) => ({
        ...apply(m, p),
        in: p.in && apply(m, p.in),
        out: p.out && apply(m, p.out),
        type: p.type,
      })),
    }));
    return subpathsBounds(transformed);
  }
  const lb = localBounds(node);
  return lb ? rectFromPoints(rectCorners(lb).map((p) => apply(m, p))) : null;
}

/** Matrix from the node's parent space to world (document) space. */
export function parentWorldMatrix(doc: DesignDocument, id: Id): Matrix {
  const loc = locate(doc, id);
  if (!loc) return { ...IDENTITY };
  return loc.ancestors.reduce<Matrix>((m, g) => multiply(m, fromTransform(g.transform)), { ...IDENTITY });
}

/** Matrix from the node's local space to world (document) space. */
export function worldMatrix(doc: DesignDocument, id: Id): Matrix {
  const loc = locate(doc, id);
  if (!loc) return { ...IDENTITY };
  return multiply(parentWorldMatrix(doc, id), fromTransform(loc.node.transform));
}

/** Axis-aligned bounding box in world space (rotation included). */
export function worldBounds(doc: DesignDocument, id: Id): Rect | null {
  const loc = locate(doc, id);
  if (!loc) return null;
  return boundsIn(loc.node, worldMatrix(doc, id));
}

/** The four corners of the node's local bounds in world space (oriented box). */
export function worldCorners(doc: DesignDocument, id: Id): Vec[] | null {
  const loc = locate(doc, id);
  if (!loc) return null;
  const lb = localBounds(loc.node);
  if (!lb) return null;
  const m = worldMatrix(doc, id);
  return rectCorners(lb).map((p) => apply(m, p));
}

export function selectionBounds(doc: DesignDocument, ids: Id[]): Rect | null {
  return unionRects(ids.map((id) => worldBounds(doc, id)));
}

export const rectContains = (r: Rect, p: Vec) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
export const rectContainsRect = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Normalized rect from two corner points. */
export const rectFromCorners = (a: Vec, b: Vec): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});
