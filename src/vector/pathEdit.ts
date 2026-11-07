// Pure edits of path geometry (node editing, reverse, join). Inputs are never mutated.
import type { BezierPoint, SubPath, Vec } from '@/model';
import { add, constrain45, dist, isLineSegment, mirror, mul, segmentCubic, splitCubic, sub } from './geometry';

/** Reference to an anchor: subpath index + point index. */
export interface AnchorRef {
  s: number;
  i: number;
}
export const anchorKey = (r: AnchorRef) => `${r.s}:${r.i}`;
export const parseKey = (k: string): AnchorRef => {
  const [s, i] = k.split(':').map(Number);
  return { s, i };
};

const clonePoint = (p: BezierPoint): BezierPoint => {
  const q: BezierPoint = { x: p.x, y: p.y, type: p.type };
  if (p.in) q.in = { ...p.in };
  if (p.out) q.out = { ...p.out };
  return q;
};
const cloneAll = (subpaths: SubPath[]): SubPath[] => subpaths.map((sp) => ({ closed: sp.closed, points: sp.points.map(clonePoint) }));

/** Moves anchors (with their handles) by a delta. */
export function moveAnchors(subpaths: SubPath[], keys: Iterable<string>, delta: Vec): SubPath[] {
  const out = cloneAll(subpaths);
  for (const k of keys) {
    const { s, i } = parseKey(k);
    const p = out[s]?.points[i];
    if (!p) continue;
    p.x += delta.x;
    p.y += delta.y;
    if (p.in) p.in = add(p.in, delta);
    if (p.out) p.out = add(p.out, delta);
  }
  return out;
}

/**
 * Moves one handle to `pos`. Symmetric points mirror the other handle; smooth points keep it
 * collinear (own length); corners move independently. `breakSymmetry` (Alt) converts to a corner first.
 * `constrain` snaps the handle angle to 45°.
 */
export function moveHandle(
  subpaths: SubPath[],
  ref: AnchorRef,
  which: 'in' | 'out',
  pos: Vec,
  opts: { breakSymmetry?: boolean; constrain?: boolean } = {},
): SubPath[] {
  const out = cloneAll(subpaths);
  const p = out[ref.s]?.points[ref.i];
  if (!p) return out;
  const target = opts.constrain ? constrain45(p, pos) : pos;
  if (opts.breakSymmetry) p.type = 'corner';
  p[which] = { x: target.x, y: target.y };
  const other = which === 'in' ? 'out' : 'in';
  if (p.type === 'symmetric') {
    p[other] = mirror(target, p);
  } else if (p.type === 'smooth' && p[other]) {
    const len = dist(p[other]!, p);
    const d = sub(p, target);
    const l = Math.hypot(d.x, d.y);
    if (l > 1e-9) p[other] = add(p, mul(d, len / l));
  }
  return out;
}

/** Handles for a smooth point from its neighbours (Catmull-Rom style, 1/3 of each neighbour distance). */
function autoHandles(sp: SubPath, i: number): { in?: Vec; out?: Vec } {
  const n = sp.points.length;
  const p = sp.points[i];
  const prev = i > 0 ? sp.points[i - 1] : sp.closed ? sp.points[n - 1] : null;
  const next = i < n - 1 ? sp.points[i + 1] : sp.closed ? sp.points[0] : null;
  if (!prev && !next) return {};
  const dir = sub(next ?? p, prev ?? p);
  const len = Math.hypot(dir.x, dir.y) || 1;
  const u = mul(dir, 1 / len);
  const res: { in?: Vec; out?: Vec } = {};
  if (prev) res.in = sub(p, mul(u, dist(p, prev) / 3));
  if (next) res.out = add(p, mul(u, dist(p, next) / 3));
  // Endpoints of open paths still get both handles so the point reads as smooth.
  if (!prev && res.out) res.in = mirror(res.out, p);
  if (!next && res.in) res.out = mirror(res.in, p);
  return res;
}

/** Double-click on an anchor: corner ↔ smooth. */
export function toggleSmooth(subpaths: SubPath[], ref: AnchorRef): SubPath[] {
  const out = cloneAll(subpaths);
  const sp = out[ref.s];
  const p = sp?.points[ref.i];
  if (!p) return out;
  if (p.type === 'corner' || (!p.in && !p.out)) {
    const h = autoHandles(sp, ref.i);
    if (h.in) p.in = h.in;
    if (h.out) p.out = h.out;
    p.type = 'smooth';
  } else {
    delete p.in;
    delete p.out;
    p.type = 'corner';
  }
  return out;
}

/** Converts a point to a corner without moving its handles (Alt-click on a handle). */
export function makeCorner(subpaths: SubPath[], ref: AnchorRef): SubPath[] {
  const out = cloneAll(subpaths);
  const p = out[ref.s]?.points[ref.i];
  if (p) p.type = 'corner';
  return out;
}

/** Inserts an anchor on segment `segment` of subpath `s` at parameter t, splitting the Bézier exactly. */
export function insertPoint(subpaths: SubPath[], s: number, segment: number, t: number): { subpaths: SubPath[]; ref: AnchorRef } {
  const out = cloneAll(subpaths);
  const sp = out[s];
  const n = sp.points.length;
  const a = sp.points[segment];
  const bIndex = (segment + 1) % n;
  const b = sp.points[bIndex];
  let np: BezierPoint;
  if (isLineSegment(sp, segment)) {
    np = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, type: 'corner' };
  } else {
    const { left, right } = splitCubic(segmentCubic(sp, segment), t);
    a.out = left[1];
    b.in = right[2];
    np = { x: left[3].x, y: left[3].y, in: left[2], out: right[1], type: 'smooth' };
  }
  sp.points.splice(segment + 1, 0, np);
  return { subpaths: out, ref: { s, i: segment + 1 } };
}

/** Removes anchors; subpaths left with fewer than 2 points are dropped. */
export function deletePoints(subpaths: SubPath[], keys: Iterable<string>): SubPath[] {
  const bySub = new Map<number, Set<number>>();
  for (const k of keys) {
    const { s, i } = parseKey(k);
    if (!bySub.has(s)) bySub.set(s, new Set());
    bySub.get(s)!.add(i);
  }
  return cloneAll(subpaths)
    .map((sp, s) => {
      const del = bySub.get(s);
      if (!del) return sp;
      return { closed: sp.closed, points: sp.points.filter((_, i) => !del.has(i)) };
    })
    .filter((sp) => sp.points.length >= 2);
}

function reverseOne(sp: SubPath): SubPath {
  const pts = [...sp.points].reverse().map((p) => {
    const q: BezierPoint = { x: p.x, y: p.y, type: p.type };
    if (p.out) q.in = { ...p.out };
    if (p.in) q.out = { ...p.in };
    return q;
  });
  // Closed paths keep their start point.
  if (sp.closed && pts.length) pts.unshift(pts.pop()!);
  return { closed: sp.closed, points: pts };
}

/** Reverses the direction of every subpath (in/out handles swap). */
export const reverseSubpaths = (subpaths: SubPath[]): SubPath[] => subpaths.map(reverseOne);

const JOIN_EPS = 1e-6;

/** Appends `b` after `a` (a's last point connects to b's first); coincident endpoints merge. */
function concat(a: SubPath, b: SubPath): SubPath {
  const pts = [...a.points.map(clonePoint)];
  const rest = b.points.map(clonePoint);
  const last = pts[pts.length - 1];
  if (rest.length && dist(last, rest[0]) < JOIN_EPS) {
    const first = rest.shift()!;
    if (first.out) last.out = first.out;
    last.type = 'corner';
  }
  return { closed: false, points: [...pts, ...rest] };
}

/** Closes an open subpath; when its endpoints coincide they merge into one anchor. */
export function closeSubpath(sp: SubPath): SubPath {
  if (sp.closed) return sp;
  const pts = sp.points.map(clonePoint);
  if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < JOIN_EPS) {
    const last = pts.pop()!;
    if (last.in) pts[0].in = last.in;
    pts[0].type = 'corner';
  }
  return { closed: true, points: pts };
}

/**
 * Join: repeatedly connects the two nearest endpoints of different open subpaths into one.
 * When a single open subpath remains (and nothing else was joined), it is closed.
 */
export function joinOpenSubpaths(subpaths: SubPath[]): SubPath[] {
  const closed = subpaths.filter((sp) => sp.closed || sp.points.length < 2);
  let open = subpaths.filter((sp) => !sp.closed && sp.points.length >= 2).map((sp) => ({ closed: false, points: sp.points.map(clonePoint) }));
  if (open.length === 1) return [...closed, closeSubpath(open[0])];
  while (open.length > 1) {
    let best = { d: Infinity, i: 0, j: 1, ai: 'end' as 'start' | 'end', bj: 'start' as 'start' | 'end' };
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const A = open[i].points;
        const B = open[j].points;
        for (const ai of ['start', 'end'] as const) {
          for (const bj of ['start', 'end'] as const) {
            const pa = ai === 'start' ? A[0] : A[A.length - 1];
            const pb = bj === 'start' ? B[0] : B[B.length - 1];
            const d = dist(pa, pb);
            if (d < best.d) best = { d, i, j, ai, bj };
          }
        }
      }
    }
    // Orient so that A ends where B starts.
    const A = best.ai === 'start' ? reverseOne(open[best.i]) : open[best.i];
    const B = best.bj === 'end' ? reverseOne(open[best.j]) : open[best.j];
    const joined = concat(A, B);
    open = [...open.filter((_, k) => k !== best.i && k !== best.j), joined];
  }
  return [...closed, ...open];
}

/** Joins two endpoint anchors (node edit with two endpoints selected). Same subpath → closes it. */
export function joinEndpoints(subpaths: SubPath[], a: AnchorRef, b: AnchorRef): SubPath[] | null {
  const spA = subpaths[a.s];
  const spB = subpaths[b.s];
  if (!spA || !spB || spA.closed || spB.closed) return null;
  const isEnd = (sp: SubPath, i: number) => i === 0 || i === sp.points.length - 1;
  if (!isEnd(spA, a.i) || !isEnd(spB, b.i)) return null;
  if (a.s === b.s) {
    if (a.i === b.i) return null;
    return subpaths.map((sp, k) => (k === a.s ? closeSubpath(sp) : sp));
  }
  const A = a.i === 0 ? reverseOne(spA) : spA;
  const B = b.i === spB.points.length - 1 ? reverseOne(spB) : spB;
  const joined = concat(A, B);
  return [...subpaths.filter((_, k) => k !== a.s && k !== b.s), joined];
}
