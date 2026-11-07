// Geometry through paper.js (booleans, simplify, curve fitting, stroke outlining). paper.js is only
// a geometry engine here: items are never inserted into a project or rendered.
import type { BezierPoint, Stroke, SubPath, Vec } from '@/model';
import type { WorldShape } from './convert';
import { add, dist, inferPointType, mul, sub } from './geometry';

type Scope = paper.PaperScope;
let scopePromise: Promise<Scope> | null = null;
let loadedScope: Scope | null = null;

/** Loads paper.js (lazy chunk) and returns a headless scope. */
export function loadPaper(): Promise<Scope> {
  scopePromise ??= import('paper/dist/paper-core').then((mod) => {
    const lib = ((mod as unknown as { default?: Scope }).default ?? mod) as Scope;
    const scope = new lib.PaperScope();
    scope.setup(new scope.Size(1, 1));
    loadedScope = scope;
    return scope;
  });
  return scopePromise;
}

/** The scope if already loaded (tools preload it on activate so pointer-up can stay synchronous). */
export const paperIfLoaded = (): Scope | null => loadedScope;

const NO_INSERT = { insert: false };

/** SubPaths → a paper CompoundPath. `closeOpen` closes open subpaths (area operations). */
export function toPaper(scope: Scope, subpaths: SubPath[], fillRule: 'nonzero' | 'evenodd' = 'nonzero', closeOpen = false): paper.CompoundPath {
  const children = subpaths
    .filter((sp) => sp.points.length > 0)
    .map((sp) => {
      const path = new scope.Path(NO_INSERT);
      for (const p of sp.points) {
        path.add(
          new scope.Segment(
            new scope.Point(p.x, p.y),
            p.in ? new scope.Point(p.in.x - p.x, p.in.y - p.y) : undefined,
            p.out ? new scope.Point(p.out.x - p.x, p.out.y - p.y) : undefined,
          ),
        );
      }
      path.closed = sp.closed || closeOpen;
      return path;
    });
  const cp = new scope.CompoundPath({ children, ...NO_INSERT });
  cp.fillRule = fillRule;
  return cp;
}

const HANDLE_EPS = 1e-6;

function pathToSubpath(path: paper.Path): SubPath {
  const points = path.segments.map((s): BezierPoint => {
    const p: BezierPoint = { x: s.point.x, y: s.point.y, type: 'corner' };
    if (s.handleIn.length > HANDLE_EPS) p.in = { x: s.point.x + s.handleIn.x, y: s.point.y + s.handleIn.y };
    if (s.handleOut.length > HANDLE_EPS) p.out = { x: s.point.x + s.handleOut.x, y: s.point.y + s.handleOut.y };
    p.type = inferPointType(p);
    return p;
  });
  return { closed: path.closed, points };
}

/** paper item → SubPaths (Paths, CompoundPaths and nested groups). */
export function fromPaper(item: paper.Item): SubPath[] {
  if (item.className === 'Path') {
    const sp = pathToSubpath(item as paper.Path);
    return sp.points.length ? [sp] : [];
  }
  return (item.children ?? []).flatMap((c) => fromPaper(c));
}

export type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude';

/** Union of several world shapes as one paper item. */
function operand(scope: Scope, shapes: WorldShape[]): paper.PathItem {
  const items = shapes.map((s) => toPaper(scope, s.subpaths, s.fillRule, true));
  let acc: paper.PathItem = items[0];
  for (let i = 1; i < items.length; i++) acc = acc.unite(items[i], NO_INSERT);
  return acc;
}

/**
 * Boolean of operands in bottom → top order (each operand is the union of its shapes).
 * subtract = bottom minus everything above it ("minus front").
 */
export function booleanOp(scope: Scope, operands: WorldShape[][], op: BooleanOp): SubPath[] {
  const items = operands.filter((o) => o.length).map((o) => operand(scope, o));
  if (!items.length) return [];
  let result: paper.PathItem = items[0];
  if (op === 'subtract') {
    if (items.length > 1) {
      let front: paper.PathItem = items[1];
      for (let i = 2; i < items.length; i++) front = front.unite(items[i], NO_INSERT);
      result = result.subtract(front, NO_INSERT);
    }
  } else {
    for (let i = 1; i < items.length; i++) result = result[op](items[i], NO_INSERT);
  }
  return fromPaper(result);
}

/** Simplifies each subpath: flattens to a polyline then refits Béziers within `tolerance`. */
export function simplifySubpaths(scope: Scope, subpaths: SubPath[], tolerance = 1): SubPath[] {
  return subpaths.flatMap((sp) => {
    if (sp.points.length < 3) return [sp];
    const path = toPaper(scope, [sp]).children[0] as paper.Path;
    path.flatten(Math.max(0.05, tolerance / 4));
    path.simplify(tolerance);
    return fromPaper(path);
  });
}

/** Fits smooth cubic Béziers through a polyline (pencil). */
export function fitCurve(scope: Scope, points: Vec[], tolerance: number, closed: boolean): SubPath {
  const path = new scope.Path({ segments: points.map((p) => [p.x, p.y]), ...NO_INSERT });
  if (points.length > 2) path.simplify(tolerance);
  path.closed = closed;
  const sp = pathToSubpath(path);
  return { ...sp, closed };
}

/** Cleans a (possibly self-intersecting) polygon outline into smooth closed subpaths (brush). */
export function polygonToSmoothSubpaths(scope: Scope, polygon: Vec[], tolerance = 0.5): SubPath[] {
  if (polygon.length < 3) return [];
  const path = new scope.Path({ segments: polygon.map((p) => [p.x, p.y]), closed: true, ...NO_INSERT });
  path.simplify(tolerance);
  const cleaned = path.unite(new scope.Path(NO_INSERT), NO_INSERT);
  return fromPaper(cleaned).filter((sp) => sp.points.length >= 2);
}

// ---------------------------------------------------------------------------------------------
// Outline stroke: the stroke is built from simple pieces (one quad per flattened segment, plus
// join and cap shapes) united by paper.js. Robust for any curve; dashes are ignored.

/** Polyline approximation of each subpath (corner points are preserved exactly). */
function flattenForStroke(scope: Scope, sp: SubPath, flatness: number): { points: Vec[]; closed: boolean } {
  const path = toPaper(scope, [sp]).children[0] as paper.Path;
  path.flatten(flatness);
  const pts = path.segments.map((s) => ({ x: s.point.x, y: s.point.y }));
  // Drop consecutive duplicates.
  const clean = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 1e-9);
  if (sp.closed && clean.length > 1 && dist(clean[0], clean[clean.length - 1]) < 1e-9) clean.pop();
  return { points: clean, closed: sp.closed };
}

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const perp = (v: Vec): Vec => ({ x: -v.y, y: v.x });

function polygonItem(scope: Scope, pts: Vec[]): paper.Path {
  const p = new scope.Path({ segments: pts.map((q) => [q.x, q.y]), closed: true, ...NO_INSERT });
  if (!p.clockwise) p.reverse();
  return p;
}

function circleItem(scope: Scope, c: Vec, r: number): paper.Path {
  const p = new scope.Path.Circle({ center: [c.x, c.y], radius: r, ...NO_INSERT });
  if (!p.clockwise) p.reverse();
  return p;
}

const MITER_LIMIT = 4;

/** Converts a stroke into filled outline subpaths (in the same coordinates as `subpaths`). */
export function outlineStroke(scope: Scope, subpaths: SubPath[], stroke: Pick<Stroke, 'width' | 'cap' | 'join'>): SubPath[] {
  const hw = stroke.width / 2;
  if (hw <= 0) return [];
  const pieces: paper.Path[] = [];
  const flatness = Math.max(0.02, Math.min(0.25, hw / 20));
  for (const sp of subpaths) {
    const { points, closed } = flattenForStroke(scope, sp, flatness);
    if (points.length < 2) {
      if (points.length === 1 && stroke.cap !== 'butt') {
        const p = points[0];
        pieces.push(stroke.cap === 'round' ? circleItem(scope, p, hw) : polygonItem(scope, [add(p, { x: -hw, y: -hw }), add(p, { x: hw, y: -hw }), add(p, { x: hw, y: hw }), add(p, { x: -hw, y: hw })]));
      }
      continue;
    }
    const n = points.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const o = mul(perp(norm(sub(b, a))), hw);
      pieces.push(polygonItem(scope, [add(a, o), add(b, o), sub(b, o), sub(a, o)]));
    }
    // Joins at interior vertices (all vertices when closed).
    const first = closed ? 0 : 1;
    const last = closed ? n - 1 : n - 2;
    for (let i = first; i <= last; i++) {
      const p = points[i];
      const prev = points[(i - 1 + n) % n];
      const next = points[(i + 1) % n];
      const d1 = norm(sub(p, prev));
      const d2 = norm(sub(next, p));
      const cross = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(cross) < 1e-9 && d1.x * d2.x + d1.y * d2.y > 0) continue; // straight
      // Outer side of the turn.
      const side = cross > 0 ? -1 : 1;
      const o1 = mul(perp(d1), hw * side);
      const o2 = mul(perp(d2), hw * side);
      const a = add(p, o1);
      const b = add(p, o2);
      const sharp = dist(a, b) > hw * 0.05;
      if (stroke.join === 'round' && sharp) {
        pieces.push(circleItem(scope, p, hw));
        continue;
      }
      if (stroke.join === 'miter') {
        const bis = norm(add(o1, o2));
        const cosHalf = (bis.x * o1.x + bis.y * o1.y) / hw;
        const miterLen = cosHalf > 1e-6 ? hw / cosHalf : Infinity;
        if (miterLen / hw <= MITER_LIMIT) {
          pieces.push(polygonItem(scope, [p, a, add(p, mul(bis, miterLen)), b]));
          continue;
        }
      }
      pieces.push(polygonItem(scope, [p, a, b]));
    }
    if (!closed) {
      const caps: [Vec, Vec][] = [
        [points[0], norm(sub(points[0], points[1]))],
        [points[n - 1], norm(sub(points[n - 1], points[n - 2]))],
      ];
      for (const [p, dir] of caps) {
        if (stroke.cap === 'round') pieces.push(circleItem(scope, p, hw));
        else if (stroke.cap === 'square') {
          const o = mul(perp(dir), hw);
          const e = add(p, mul(dir, hw));
          pieces.push(polygonItem(scope, [add(p, o), add(e, o), sub(e, o), sub(p, o)]));
        }
      }
    }
  }
  if (!pieces.length) return [];
  const all = new scope.CompoundPath({ children: pieces, ...NO_INSERT });
  all.fillRule = 'nonzero';
  const united = all.unite(new scope.Path(NO_INSERT), NO_INSERT);
  // Drop collinear points left by the union, then refit the curved runs between corners into
  // Béziers so the result stays light (corners stay exact).
  const tolerance = Math.max(0.05, Math.min(1, hw / 10));
  return fromPaper(united)
    .map(dropCollinear)
    .filter((sp) => sp.points.length >= 3)
    .map((sp) => refitPolygon(scope, sp, tolerance));
}

const CORNER_COS = Math.cos((30 * Math.PI) / 180);

/**
 * Refits a closed, handle-less polygon with cubic Béziers: split at corners (turns sharper than
 * 30° or long straight edges), fit each run with paper.js simplify and stitch them back. Returns
 * the input when it already has curves or when the fit is not lighter.
 */
export function refitPolygon(scope: Scope, sp: SubPath, tolerance: number): SubPath {
  if (!sp.closed || sp.points.length < 6) return sp;
  // Mixed outlines (arcs from round joins/caps): flatten to a polyline first.
  let pts: Vec[] = sp.points;
  if (sp.points.some((p) => p.in || p.out)) {
    const flat = toPaper(scope, [sp]).children[0] as paper.Path;
    flat.flatten(Math.max(0.02, tolerance / 4));
    pts = flat.segments.map((g) => ({ x: g.point.x, y: g.point.y }));
  }
  const n = pts.length;
  if (n < 6) return sp;
  // Edge lengths: a long edge is a real straight side; its ends are kept as corners.
  const lens = pts.map((p, i) => dist(p, pts[(i + 1) % n]));
  const median = [...lens].sort((a, b) => a - b)[Math.floor(n / 2)];
  const isCorner = pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const a = { x: p.x - prev.x, y: p.y - prev.y };
    const b = { x: next.x - p.x, y: next.y - p.y };
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (!la || !lb) return true;
    const cos = (a.x * b.x + a.y * b.y) / (la * lb);
    const longEdge = Math.max(la, lb) > Math.max(median * 6, tolerance * 20);
    return cos < CORNER_COS || longEdge;
  });
  let corners = isCorner.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  // paper.js fits closed loops poorly: a loop without corners is split into four open runs whose
  // joints are smoothed afterwards.
  const soft = new Set<number>();
  if (!corners.length) {
    corners = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)];
    corners.forEach((c) => soft.add(c));
  }

  const fitRun = (run: Vec[]): BezierPoint[] => {
    const path = new scope.Path({ segments: run.map((q) => [q.x, q.y]), ...NO_INSERT });
    if (run.length > 2) path.simplify(tolerance * tolerance); // paper compares squared distances
    return pathToSubpath(path).points;
  };

  const points: BezierPoint[] = [];
  const jointAt: number[] = [];
  for (let k = 0; k < corners.length; k++) {
    const from = corners[k];
    const to = corners[(k + 1) % corners.length];
    const run: Vec[] = [];
    for (let i = from; ; i = (i + 1) % n) {
      run.push(pts[i]);
      if ((i === to && run.length > 1) || run.length > n + 1) break;
    }
    const fitted = fitRun(run);
    // Stitch: the run's first point merges with the previous run's last point (the joint).
    if (points.length) {
      const joint = points[points.length - 1];
      if (fitted[0].out) joint.out = fitted[0].out;
      points.push(...fitted.slice(1));
    } else points.push(...fitted);
    jointAt.push(points.length - 1);
  }
  // The last run ends on the first joint: merge into points[0].
  const last = points.pop()!;
  jointAt.pop();
  jointAt.unshift(0);
  if (last.in) points[0].in = last.in;
  jointAt.forEach((idx, k) => {
    const p = points[idx];
    if (!soft.has(corners[k]) || !p.in || !p.out) {
      p.type = 'corner';
      return;
    }
    // Soft joint: make the handles collinear (smooth), keeping their lengths.
    const dx = p.out.x - p.in.x;
    const dy = p.out.y - p.in.y;
    const len = Math.hypot(dx, dy) || 1;
    const li = Math.hypot(p.in.x - p.x, p.in.y - p.y);
    const lo = Math.hypot(p.out.x - p.x, p.out.y - p.y);
    p.in = { x: p.x - (dx / len) * li, y: p.y - (dy / len) * li };
    p.out = { x: p.x + (dx / len) * lo, y: p.y + (dy / len) * lo };
    p.type = 'smooth';
  });
  return points.length >= 3 && points.length < sp.points.length ? { closed: true, points } : sp;
}

/** Removes points of straight runs (only for handle-less points). */
function dropCollinear(sp: SubPath): SubPath {
  const pts = sp.points;
  if (pts.length < 4) return sp;
  const keep = pts.filter((p, i) => {
    if (p.in || p.out) return true;
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    if (!sp.closed && (i === 0 || i === pts.length - 1)) return true;
    const cross = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x);
    const len = dist(prev, p) * dist(p, next);
    return len === 0 ? false : Math.abs(cross) / len > 1e-4;
  });
  return { closed: sp.closed, points: keep };
}
