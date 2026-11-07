import { round } from './matrix';
import type { BezierPoint, EllipseNode, PolygonNode, RectNode, SceneNode, SubPath, Vec } from './types';

const K = 0.5522847498; // circle → cubic Bézier constant

const fmt = (p: Vec) => `${round(p.x)} ${round(p.y)}`;

/** SVG path data for a list of subpaths. */
export function subpathsToD(subpaths: SubPath[]): string {
  const out: string[] = [];
  for (const sp of subpaths) {
    const pts = sp.points;
    if (!pts.length) continue;
    out.push(`M${fmt(pts[0])}`);
    const segCount = sp.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const closing = sp.closed && i === pts.length - 1;
      if (!a.out && !b.in) {
        if (!closing) out.push(`L${fmt(b)}`);
      } else out.push(`C${fmt(a.out ?? a)} ${fmt(b.in ?? b)} ${fmt(b)}`);
    }
    if (sp.closed) out.push('Z');
  }
  return out.join('');
}

const corner = (x: number, y: number, extra: Partial<BezierPoint> = {}): BezierPoint => ({ x, y, type: 'corner', ...extra });

export function rectSubpaths(n: Pick<RectNode, 'width' | 'height' | 'radius'>): SubPath[] {
  const w = n.width / 2;
  const h = n.height / 2;
  const r = Math.max(0, Math.min(n.radius, w, h));
  if (r === 0) {
    return [{ closed: true, points: [corner(-w, -h), corner(w, -h), corner(w, h), corner(-w, h)] }];
  }
  const k = r * (1 - K);
  return [
    {
      closed: true,
      points: [
        corner(-w + r, -h, { in: { x: -w + k, y: -h } }),
        corner(w - r, -h, { out: { x: w - k, y: -h } }),
        corner(w, -h + r, { in: { x: w, y: -h + k } }),
        corner(w, h - r, { out: { x: w, y: h - k } }),
        corner(w - r, h, { in: { x: w - k, y: h } }),
        corner(-w + r, h, { out: { x: -w + k, y: h } }),
        corner(-w, h - r, { in: { x: -w, y: h - k } }),
        corner(-w, -h + r, { out: { x: -w, y: -h + k } }),
      ],
    },
  ];
}

export function ellipseSubpaths(n: Pick<EllipseNode, 'rx' | 'ry'>): SubPath[] {
  const { rx, ry } = n;
  const kx = rx * K;
  const ky = ry * K;
  return [
    {
      closed: true,
      points: [
        { x: 0, y: -ry, in: { x: -kx, y: -ry }, out: { x: kx, y: -ry }, type: 'symmetric' },
        { x: rx, y: 0, in: { x: rx, y: -ky }, out: { x: rx, y: ky }, type: 'symmetric' },
        { x: 0, y: ry, in: { x: kx, y: ry }, out: { x: -kx, y: ry }, type: 'symmetric' },
        { x: -rx, y: 0, in: { x: -rx, y: ky }, out: { x: -rx, y: -ky }, type: 'symmetric' },
      ],
    },
  ];
}

export function polygonVertices(n: Pick<PolygonNode, 'sides' | 'radius' | 'innerRadius'>): Vec[] {
  const sides = Math.max(3, Math.round(n.sides));
  const star = n.innerRadius !== undefined;
  const count = star ? sides * 2 : sides;
  const pts: Vec[] = [];
  for (let i = 0; i < count; i++) {
    const r = star && i % 2 === 1 ? n.innerRadius! : n.radius;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return pts;
}

export function polygonSubpaths(n: Pick<PolygonNode, 'sides' | 'radius' | 'innerRadius'>): SubPath[] {
  return [{ closed: true, points: polygonVertices(n).map((p) => corner(p.x, p.y)) }];
}

/**
 * Geometry of a node as subpaths in its local coordinates, or null when the node has no
 * vector outline (group, text, image). Text outlines are produced by the fonts module.
 */
export function nodeSubpaths(node: SceneNode): SubPath[] | null {
  switch (node.type) {
    case 'rect':
      return rectSubpaths(node);
    case 'ellipse':
      return ellipseSubpaths(node);
    case 'polygon':
      return polygonSubpaths(node);
    case 'path':
      return node.subpaths;
    default:
      return null;
  }
}

/** SVG path data of a node in its local coordinates ('' for nodes without an outline). */
export function nodeToSvgPath(node: SceneNode): string {
  const sp = nodeSubpaths(node);
  return sp ? subpathsToD(sp) : '';
}

/** Flattens subpaths into polylines (each cubic sampled into `steps` segments). */
export function flattenSubpaths(subpaths: SubPath[], steps = 16): { points: Vec[]; closed: boolean }[] {
  return subpaths.map((sp) => {
    const out: Vec[] = [];
    const pts = sp.points;
    if (!pts.length) return { points: out, closed: sp.closed };
    out.push({ x: pts[0].x, y: pts[0].y });
    const segCount = sp.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (!a.out && !b.in) {
        out.push({ x: b.x, y: b.y });
        continue;
      }
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      for (let s = 1; s <= steps; s++) out.push(cubicAt(a, c1, c2, b, s / steps));
    }
    return { points: out, closed: sp.closed };
  });
}

export function cubicAt(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Parameters in (0,1) where a 1D cubic has extrema. */
export function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}
