// Pure Bézier / subpath geometry used by the vector tools (pen, node edit, booleans).
import { apply, applyLinear, cubicAt, lerpVec, multiply, subpathsBounds, worldMatrix, type BezierPoint, type DesignDocument, type Id, type Matrix, type PointType, type SubPath, type Vec } from '@/model';

export type Cubic = [Vec, Vec, Vec, Vec];

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
/** Point reflected through `center`. */
export const mirror = (p: Vec, center: Vec): Vec => ({ x: 2 * center.x - p.x, y: 2 * center.y - p.y });

/**
 * De Casteljau subdivision of a cubic at `t`: two cubics that retrace the original exactly.
 */
export function splitCubic(c: Cubic, t: number): { left: Cubic; right: Cubic } {
  const [p0, p1, p2, p3] = c;
  const a = lerpVec(p0, p1, t);
  const b = lerpVec(p1, p2, t);
  const cc = lerpVec(p2, p3, t);
  const d = lerpVec(a, b, t);
  const e = lerpVec(b, cc, t);
  const f = lerpVec(d, e, t);
  return { left: [p0, a, d, f], right: [f, e, cc, p3] };
}

/** Number of segments of a subpath. */
export const segmentCount = (sp: SubPath) => (sp.points.length < 2 ? 0 : sp.closed ? sp.points.length : sp.points.length - 1);

/** Cubic control points of segment `i` (from point i to point i+1). Lines have controls on the anchors. */
export function segmentCubic(sp: SubPath, i: number): Cubic {
  const a = sp.points[i];
  const b = sp.points[(i + 1) % sp.points.length];
  return [
    { x: a.x, y: a.y },
    a.out ?? { x: a.x, y: a.y },
    b.in ?? { x: b.x, y: b.y },
    { x: b.x, y: b.y },
  ];
}

export const isLineSegment = (sp: SubPath, i: number) => !sp.points[i].out && !sp.points[(i + 1) % sp.points.length].in;

/** Closest parameter on a cubic to `p`: coarse sampling then local refinement. */
export function nearestOnCubic(c: Cubic, p: Vec, samples = 48): { t: number; point: Vec; distance: number } {
  let bestT = 0;
  let best = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const d = dist(cubicAt(c[0], c[1], c[2], c[3], t), p);
    if (d < best) {
      best = d;
      bestT = t;
    }
  }
  // Golden-section-ish refinement around the best sample.
  let lo = Math.max(0, bestT - 1 / samples);
  let hi = Math.min(1, bestT + 1 / samples);
  for (let k = 0; k < 30; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const d1 = dist(cubicAt(c[0], c[1], c[2], c[3], m1), p);
    const d2 = dist(cubicAt(c[0], c[1], c[2], c[3], m2), p);
    if (d1 < d2) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  const point = cubicAt(c[0], c[1], c[2], c[3], t);
  const d = dist(point, p);
  return d < best ? { t, point, distance: d } : { t: bestT, point: cubicAt(c[0], c[1], c[2], c[3], bestT), distance: best };
}

/** Closest point on a straight segment (t is linear along the segment). */
export function nearestOnLine(a: Vec, b: Vec, p: Vec): { t: number; point: Vec; distance: number } {
  const d = sub(b, a);
  const len2 = d.x * d.x + d.y * d.y;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / len2));
  const point = lerpVec(a, b, t);
  return { t, point, distance: dist(point, p) };
}

export interface SegmentHit {
  subpath: number;
  segment: number;
  t: number;
  point: Vec;
  distance: number;
}

/** Closest segment of any subpath to `p` within `tolerance` (local units). */
export function nearestSegment(subpaths: SubPath[], p: Vec, tolerance: number): SegmentHit | null {
  let best: SegmentHit | null = null;
  subpaths.forEach((sp, si) => {
    for (let i = 0; i < segmentCount(sp); i++) {
      const c = segmentCubic(sp, i);
      // Cheap reject with the control-point box.
      const minX = Math.min(c[0].x, c[1].x, c[2].x, c[3].x) - tolerance;
      const maxX = Math.max(c[0].x, c[1].x, c[2].x, c[3].x) + tolerance;
      const minY = Math.min(c[0].y, c[1].y, c[2].y, c[3].y) - tolerance;
      const maxY = Math.max(c[0].y, c[1].y, c[2].y, c[3].y) + tolerance;
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const hit = isLineSegment(sp, i) ? nearestOnLine(c[0], c[3], p) : nearestOnCubic(c, p);
      if (hit.distance <= tolerance && (!best || hit.distance < best.distance)) {
        best = { subpath: si, segment: i, t: hit.t, point: hit.point, distance: hit.distance };
      }
    }
  });
  return best;
}

/** Transforms subpaths (anchors and handles) by a matrix. */
export function transformSubpaths(subpaths: SubPath[], m: Matrix): SubPath[] {
  const tp = (p: Vec) => apply(m, p);
  return subpaths.map((sp) => ({
    closed: sp.closed,
    points: sp.points.map((p) => {
      const q: BezierPoint = { ...tp(p), type: p.type };
      if (p.in) q.in = tp(p.in);
      if (p.out) q.out = tp(p.out);
      return q;
    }),
  }));
}

/** Translates subpaths so their bounds are centered on the origin; returns the old center. */
export function centerSubpaths(subpaths: SubPath[]): { subpaths: SubPath[]; center: Vec } {
  const b = subpathsBounds(subpaths);
  if (!b) return { subpaths, center: { x: 0, y: 0 } };
  const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  return { subpaths: transformSubpaths(subpaths, { a: 1, b: 0, c: 0, d: 1, e: -center.x, f: -center.y }), center };
}

/** Classifies a point by its handles: collinear opposite handles are smooth (symmetric if equal length). */
export function inferPointType(p: Pick<BezierPoint, 'x' | 'y' | 'in' | 'out'>, eps = 1e-3): PointType {
  if (!p.in || !p.out) return 'corner';
  const a = sub(p.in, p);
  const b = sub(p.out, p);
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la < eps || lb < eps) return 'corner';
  const cross = (a.x * b.y - a.y * b.x) / (la * lb);
  const dot = (a.x * b.x + a.y * b.y) / (la * lb);
  if (Math.abs(cross) > 1e-2 || dot > 0) return 'corner';
  return Math.abs(la - lb) < Math.max(eps, 1e-3 * Math.max(la, lb)) ? 'symmetric' : 'smooth';
}

/** Snaps the direction from `origin` to `p` to the nearest 45° while keeping its length. */
export function constrain45(origin: Vec, p: Vec): Vec {
  const d = sub(p, origin);
  const len = Math.hypot(d.x, d.y);
  if (len === 0) return p;
  const a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * (Math.PI / 4);
  // Diagonals keep the projected length so the cursor stays under the line.
  const proj = d.x * Math.cos(a) + d.y * Math.sin(a);
  return { x: origin.x + proj * Math.cos(a), y: origin.y + proj * Math.sin(a) };
}

/** Linear part of a matrix applied to a vector (re-export for tools). */
export const linear = applyLinear;

/** Local → screen matrix of a node (view matrix · node world matrix). */
export const nodeScreenMatrix = (doc: DesignDocument, id: Id, view: Matrix) => multiply(view, worldMatrix(doc, id));
