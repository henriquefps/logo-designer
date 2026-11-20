// Flow arrow routing (docs/wireframe-mode.md → Phase 2: Flows → Arrow routing). Pure geometry in document space, no
// document types: the canvas overlay, `designer wf sheet` and arrow picking all route through `routeFlows`.
//
// An arrow is an orthogonal polyline that never passes over a frame other than its own two:
// - it leaves the source element through a stub to the outside of the source frame (left / right, or up / down for a
//   part in a row), then travels on lanes in the gutters between frames, and enters the target frame from one of its
//   sides (the top only when nothing else works well: the screen's name sits there);
// - frames are hard obstacles, grown upwards by `band` (the screen name strip above each frame); notes are soft (a
//   route crosses one only when going around costs much more);
// - the lanes are a sparse grid (frame edges ± clearance, gutter middles, the ports) around the frames between the two
//   ends; an A* search on it keeps routes short with few bends;
// - arrows that share a lane are spread apart (`nudge`), ordered so they cross as little as possible;
// - labels sit on the clear part of a route, off frames, notes and other labels (`placeLabels`).
// Deterministic (same input, same output) and memoized per layout by the caller (flows.ts → `flowLayout`).
import type { Rect, Vec } from '@/model';

export interface RouteRequest {
  /** The source element's (or part's) rectangle. */
  source: Rect;
  /** A part in a row (a tab of a bottom navigation): leaves from its top or bottom centre, never along the row. */
  vertical?: boolean;
  /** Index in `frames` of the frame that contains the source, or -1. */
  from: number;
  /** Index in `frames` of the target frame. */
  to: number;
  /** Leaves from any of the source's four sides (a note's connector), not only left / right. */
  anySide?: boolean;
  /** The point inside the target frame the route heads for (a note's target): the end port is aligned with it, not with the source. */
  aim?: Vec;
}

export interface FlowRoute {
  /** Orthogonal polyline: the source port first, the point on the target frame's edge last. */
  points: Vec[];
  /** Unit direction of the last segment (the arrowhead's direction). */
  dir: Vec;
}

export interface RouteOptions {
  /** Height kept clear above every frame (its name strip), document units. Default 0. */
  band?: number;
  /** Soft obstacles: notes. */
  notes?: readonly Rect[];
  /** Distance kept from frames by lanes that hug them. Default 24. */
  clearance?: number;
  /** Spacing between arrows sharing a lane. Default 10. */
  gap?: number;
}

/** Keeps the end point this far from a frame's corners. */
export const EDGE_INSET = 24;
const BEND = 48;
/** Entering through the top passes over the screen's name: a last resort. */
const TOP_PENALTY = 40 * BEND;
/** Cost per unit of length over a note. */
const NOTE_FACTOR = 8;
/** Cost per unit of length next to an earlier arrow (per arrow). */
const BUSY_FACTOR = 0.5;

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;

/** Directions: 0 = +x, 1 = -x, 2 = +y, 3 = -y. */
const DIRS: readonly Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const REVERSE = [1, 0, 3, 2];

/** Open-interior overlap of two rectangles (touching edges do not count). */
export function rectsOverlap(a: Rect, b: Rect, eps = 0.01): boolean {
  return a.x < right(b) - eps && right(a) > b.x + eps && a.y < bottom(b) - eps && bottom(a) > b.y + eps;
}

/** True when the axis-aligned segment a–b passes through the interior of `r`. */
export function segmentHitsRect(a: Vec, b: Vec, r: Rect, eps = 0.01): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  if (x0 === x1) return x0 > r.x + eps && x0 < right(r) - eps && y0 < bottom(r) - eps && y1 > r.y + eps;
  if (y0 === y1) return y0 > r.y + eps && y0 < bottom(r) - eps && x0 < right(r) - eps && x1 > r.x + eps;
  return rectsOverlap({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, r, eps);
}

// ---------- ports ----------

interface Port {
  /** On the element (start) or on the target frame's edge (end). */
  at: Vec;
  /** Outside the frame, where the arrow joins the lanes. */
  out: Vec;
  /** Start: the stub's direction (from `at` to `out`). End: the direction the arrow enters with. */
  dir: number;
  /** Extra cost of using this port. */
  cost: number;
}

/**
 * The free distance from frame `f`'s side `dir` (0 right, 1 left, 2 bottom, 3 top) to the nearest other obstacle across
 * the perpendicular coordinate `along`, capped at `max`.
 */
function freeBeyond(obstacles: readonly Rect[], self: number, f: Rect, dir: number, along: number, max: number): number {
  let gap = max;
  for (let i = 0; i < obstacles.length; i++) {
    if (i === self) continue;
    const o = obstacles[i];
    if (dir < 2) {
      if (!(along > o.y && along < bottom(o))) continue;
      const d = dir === 0 ? o.x - right(f) : f.x - right(o);
      if (d > -1 && d < gap) gap = Math.max(0, d);
    } else {
      if (!(along > o.x && along < right(o))) continue;
      const d = dir === 2 ? o.y - bottom(f) : f.y - bottom(o);
      if (d > -1 && d < gap) gap = Math.max(0, d);
    }
  }
  return gap;
}

/** Leaves frame `f` (obstacle index `self`, or -1 with `f` null) from `at` in direction `dir`. */
function outPoint(obstacles: readonly Rect[], self: number, f: Rect | null, at: Vec, dir: number, c: number): Vec | null {
  if (!f) return { x: at.x + DIRS[dir].x * c, y: at.y + DIRS[dir].y * c };
  const along = dir < 2 ? at.y : at.x;
  const gap = freeBeyond(obstacles, self, f, dir, along, 2 * c);
  if (gap < 4) return null;
  const off = Math.min(c, gap / 2);
  if (dir === 0) return { x: right(f) + off, y: at.y };
  if (dir === 1) return { x: f.x - off, y: at.y };
  if (dir === 2) return { x: at.x, y: bottom(f) + off };
  return { x: at.x, y: f.y - off };
}

function startPorts(req: RouteRequest, obstacles: readonly Rect[], c: number): Port[] {
  const s = req.source;
  const f = req.from >= 0 ? obstacles[req.from] : null;
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const cand: { at: Vec; dir: number }[] = req.anySide
    ? [
        { at: { x: right(s), y: cy }, dir: 0 },
        { at: { x: s.x, y: cy }, dir: 1 },
        { at: { x: cx, y: bottom(s) }, dir: 2 },
        { at: { x: cx, y: s.y }, dir: 3 },
      ]
    : req.vertical
    ? [
        { at: { x: cx, y: s.y }, dir: 3 },
        { at: { x: cx, y: bottom(s) }, dir: 2 },
      ]
    : [
        { at: { x: right(s), y: cy }, dir: 0 },
        { at: { x: s.x, y: cy }, dir: 1 },
      ];
  const out: Port[] = [];
  for (const p of cand) {
    const o = outPoint(obstacles, req.from, f, p.at, p.dir, c);
    if (o) out.push({ at: p.at, out: o, dir: p.dir, cost: Math.abs(o.x - p.at.x) + Math.abs(o.y - p.at.y) });
  }
  return out;
}

function endPorts(t: Rect, frame: Rect, toIndex: number, obstacles: readonly Rect[], from: Vec, c: number): Port[] {
  const yc = clamp(from.y, t.y + EDGE_INSET, bottom(t) - EDGE_INSET);
  const xc = clamp(from.x, t.x + EDGE_INSET, right(t) - EDGE_INSET);
  const out: Port[] = [];
  // [side of the frame the arrow crosses, the point on it, the direction it enters with]
  const sides: [number, Vec, number][] = [
    [1, { x: t.x, y: yc }, 0],
    [0, { x: right(t), y: yc }, 1],
    [2, { x: xc, y: bottom(t) }, 3],
    [3, { x: xc, y: t.y }, 2],
  ];
  for (const [side, at, dir] of sides) {
    // The obstacle is the frame grown by its name strip: the top port starts above the strip.
    const o = outPoint(obstacles, toIndex, frame, side === 3 ? { x: at.x, y: frame.y } : at, side, c);
    if (!o) continue;
    out.push({ at, out: o, dir, cost: side === 3 ? TOP_PENALTY : 0 });
  }
  return out;
}

// ---------- the lane grid and the search ----------

/** Binary min-heap of (priority, value). */
class Heap {
  private p: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(pr: number, val: number) {
    const p = this.p;
    const v = this.v;
    let i = v.length;
    p.push(pr);
    v.push(val);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] < pr || (p[up] === pr && v[up] <= val)) break;
      p[i] = p[up];
      v[i] = v[up];
      i = up;
    }
    p[i] = pr;
    v[i] = val;
  }
  /** Pops the smallest; returns its value (its priority is in `last`). */
  last = 0;
  pop(): number {
    const p = this.p;
    const v = this.v;
    const topV = v[0];
    this.last = p[0];
    const lp = p.pop()!;
    const lv = v.pop()!;
    const n = v.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && (p[r] < p[l] || (p[r] === p[l] && v[r] < v[l])) ? r : l;
        if (p[m] > lp || (p[m] === lp && v[m] >= lv)) break;
        p[i] = p[m];
        v[i] = v[m];
        i = m;
      }
      p[i] = lp;
      v[i] = lv;
    }
    return topV;
  }
}

const uniqSorted = (a: number[]) => {
  a.sort((x, y) => x - y);
  const out: number[] = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 0.5) out.push(v);
  return out;
};

function indexOf(lanes: readonly number[], v: number): number {
  let lo = 0;
  let hi = lanes.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (lanes[m] < v - 0.5) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** One route on the lane grid between the start ports and the end ports, or null when every way is closed. */
function search(obstacles: readonly Rect[], notes: readonly Rect[], starts: Port[], ends: Port[], c: number, busy: readonly (readonly Vec[])[]): Vec[] | null {
  if (!starts.length || !ends.length) return null;
  // The window: the two ends and every frame it touches, grown until stable, plus room to go around.
  const pts = [...starts.flatMap((p) => [p.at, p.out]), ...ends.flatMap((p) => [p.at, p.out])];
  let x0 = Math.min(...pts.map((p) => p.x));
  let x1 = Math.max(...pts.map((p) => p.x));
  let y0 = Math.min(...pts.map((p) => p.y));
  let y1 = Math.max(...pts.map((p) => p.y));
  const inWin: Rect[] = [];
  const used = new Uint8Array(obstacles.length);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (used[i] || !(o.x < x1 + c && right(o) > x0 - c && o.y < y1 + c && bottom(o) > y0 - c)) continue;
      used[i] = 1;
      inWin.push(o);
      x0 = Math.min(x0, o.x);
      x1 = Math.max(x1, right(o));
      y0 = Math.min(y0, o.y);
      y1 = Math.max(y1, bottom(o));
      changed = true;
    }
  }
  const softs = notes.filter((n) => n.x < x1 + 2 * c && right(n) > x0 - 2 * c && n.y < y1 + 2 * c && bottom(n) > y0 - 2 * c);

  const xs: number[] = [x0 - 2 * c, x1 + 2 * c];
  const ys: number[] = [y0 - 2 * c, y1 + 2 * c];
  const edgesX: number[] = [];
  const edgesY: number[] = [];
  for (const o of inWin) {
    xs.push(o.x - c, right(o) + c);
    ys.push(o.y - c, bottom(o) + c);
    edgesX.push(o.x, right(o));
    edgesY.push(o.y, bottom(o));
  }
  for (const n of softs) {
    xs.push(n.x - c, right(n) + c);
    ys.push(n.y - c, bottom(n) + c);
  }
  // Gutter middles: between consecutive frame edges.
  const ex = uniqSorted(edgesX);
  const ey = uniqSorted(edgesY);
  for (let i = 0; i + 1 < ex.length; i++) xs.push((ex[i] + ex[i + 1]) / 2);
  for (let i = 0; i + 1 < ey.length; i++) ys.push((ey[i] + ey[i + 1]) / 2);
  for (const p of [...starts, ...ends]) {
    xs.push(p.out.x);
    ys.push(p.out.y);
  }
  const X = uniqSorted(xs);
  const Y = uniqSorted(ys);
  const nx = X.length;
  const ny = Y.length;
  const N = nx * ny;
  const blockedNode = new Uint8Array(N);
  const blockH = new Uint8Array(N); // edge (i, j) → (i + 1, j)
  const blockV = new Uint8Array(N); // edge (i, j) → (i, j + 1)
  const softH = new Float64Array(N);
  const softV = new Float64Array(N);
  const eps = 0.01;
  for (const o of inWin) {
    const ja = indexOf(Y, o.y);
    for (let j = ja; j < ny && Y[j] < bottom(o) - eps; j++) {
      if (Y[j] <= o.y + eps) continue;
      for (let i = indexOf(X, o.x) - 1; i < nx && (i < 0 || X[i] < right(o)); i++) {
        if (i < 0) continue;
        if (X[i] > o.x + eps && X[i] < right(o) - eps) blockedNode[j * nx + i] = 1;
        if (i + 1 < nx && X[i] < right(o) - eps && X[i + 1] > o.x + eps) blockH[j * nx + i] = 1;
      }
    }
    for (let i = indexOf(X, o.x); i < nx && X[i] < right(o) - eps; i++) {
      if (X[i] <= o.x + eps) continue;
      for (let j = Math.max(0, indexOf(Y, o.y) - 1); j + 1 < ny && Y[j] < bottom(o); j++) {
        if (Y[j] < bottom(o) - eps && Y[j + 1] > o.y + eps) blockV[j * nx + i] = 1;
      }
    }
  }
  for (const n of softs) {
    for (let j = 0; j < ny; j++) {
      if (!(Y[j] > n.y && Y[j] < bottom(n))) continue;
      for (let i = 0; i + 1 < nx; i++) {
        const ov = Math.min(X[i + 1], right(n)) - Math.max(X[i], n.x);
        if (ov > 0) softH[j * nx + i] += ov * NOTE_FACTOR;
      }
    }
    for (let i = 0; i < nx; i++) {
      if (!(X[i] > n.x && X[i] < right(n))) continue;
      for (let j = 0; j + 1 < ny; j++) {
        const ov = Math.min(Y[j + 1], bottom(n)) - Math.max(Y[j], n.y);
        if (ov > 0) softV[j * nx + i] += ov * NOTE_FACTOR;
      }
    }
  }

  // Lanes already taken by earlier arrows cost more where the gutter is narrow (in the open, spreading is enough):
  // later arrows take another gutter when that is cheap.
  const narrow = (horiz: boolean, v: number, a: number, b: number) => {
    let lo = -Infinity;
    let hi = Infinity;
    for (const o of inWin) {
      if (horiz ? !(o.x < b && right(o) > a) : !(o.y < b && bottom(o) > a)) continue;
      const pLo = horiz ? o.y : o.x;
      const pHi = horiz ? bottom(o) : right(o);
      if (pHi <= v) lo = Math.max(lo, pHi);
      else if (pLo >= v) hi = Math.min(hi, pLo);
    }
    const room = hi - lo;
    return room > 6 * c ? 0 : 1;
  };
  for (const pts of busy) {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      if (Math.abs(a.y - b.y) < 1e-6) {
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        for (let j = indexOf(Y, a.y - c); j < ny && Y[j] < a.y + c; j++) {
          for (let i = Math.max(0, indexOf(X, lo) - 1); i + 1 < nx && X[i] < hi; i++) {
            const ov = Math.min(X[i + 1], hi) - Math.max(X[i], lo);
            if (ov > 0) softH[j * nx + i] += ov * BUSY_FACTOR * narrow(true, Y[j], X[i], X[i + 1]);
          }
        }
      } else {
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        for (let i = indexOf(X, a.x - c); i < nx && X[i] < a.x + c; i++) {
          for (let j = Math.max(0, indexOf(Y, lo) - 1); j + 1 < ny && Y[j] < hi; j++) {
            const ov = Math.min(Y[j + 1], hi) - Math.max(Y[j], lo);
            if (ov > 0) softV[j * nx + i] += ov * BUSY_FACTOR * narrow(false, X[i], Y[j], Y[j + 1]);
          }
        }
      }
    }
  }

  const node = (p: Vec) => indexOf(Y, p.y) * nx + indexOf(X, p.x);
  const goals = new Map<number, Port[]>();
  for (const e of ends) {
    const n = node(e.out);
    if (blockedNode[n]) continue;
    goals.set(n, [...(goals.get(n) ?? []), e]);
  }
  if (!goals.size) return null;
  const goalPts = [...goals.keys()].map((n) => ({ x: X[n % nx], y: Y[Math.floor(n / nx)] }));
  const h = (n: number) => {
    const x = X[n % nx];
    const y = Y[Math.floor(n / nx)];
    let best = Infinity;
    for (const g of goalPts) best = Math.min(best, Math.abs(g.x - x) + Math.abs(g.y - y));
    return best;
  };

  const S = N * 4;
  const dist = new Float64Array(S).fill(Infinity);
  const prev = new Int32Array(S).fill(-1);
  const startOf = new Int32Array(S).fill(-1);
  const heap = new Heap();
  starts.forEach((p, k) => {
    const n = node(p.out);
    if (blockedNode[n]) return;
    const st = n * 4 + p.dir;
    if (p.cost < dist[st]) {
      dist[st] = p.cost;
      startOf[st] = k;
      heap.push(p.cost + h(n), st);
    }
  });
  let best = Infinity;
  let bestState = -1;
  let bestEnd: Port | null = null;
  while (heap.size) {
    const st = heap.pop();
    if (heap.last >= best) break;
    const g = dist[st];
    const n = st >> 2;
    const d = st & 3;
    const ends = goals.get(n);
    if (ends) {
      for (const e of ends) {
        const total = g + (d === e.dir ? 0 : BEND) + Math.abs(e.out.x - e.at.x) + Math.abs(e.out.y - e.at.y) + e.cost;
        if (total < best) {
          best = total;
          bestState = st;
          bestEnd = e;
        }
      }
    }
    const i = n % nx;
    const j = (n - i) / nx;
    for (let d2 = 0; d2 < 4; d2++) {
      if (d2 === REVERSE[d]) continue;
      let m: number;
      let len: number;
      let extra: number;
      if (d2 === 0) {
        if (i + 1 >= nx || blockH[n]) continue;
        m = n + 1;
        len = X[i + 1] - X[i];
        extra = softH[n];
      } else if (d2 === 1) {
        if (i === 0 || blockH[n - 1]) continue;
        m = n - 1;
        len = X[i] - X[i - 1];
        extra = softH[n - 1];
      } else if (d2 === 2) {
        if (j + 1 >= ny || blockV[n]) continue;
        m = n + nx;
        len = Y[j + 1] - Y[j];
        extra = softV[n];
      } else {
        if (j === 0 || blockV[n - nx]) continue;
        m = n - nx;
        len = Y[j] - Y[j - 1];
        extra = softV[n - nx];
      }
      if (blockedNode[m]) continue;
      const ng = g + len + extra + (d2 === d ? 0 : BEND);
      const ms = m * 4 + d2;
      if (ng < dist[ms]) {
        dist[ms] = ng;
        prev[ms] = st;
        startOf[ms] = startOf[st];
        heap.push(ng + h(m), ms);
      }
    }
  }
  if (bestState < 0 || !bestEnd) return null;
  const path: Vec[] = [];
  for (let st = bestState; st >= 0; st = prev[st]) {
    const n = st >> 2;
    path.push({ x: X[n % nx], y: Y[Math.floor(n / nx)] });
  }
  path.reverse();
  const start = starts[startOf[bestState]];
  return simplify([start.at, ...path, bestEnd.at]);
}

/** Drops repeated points and the middle of straight runs. */
function simplify(points: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      if ((Math.abs(a.x - q.x) < 1e-6 && Math.abs(q.x - p.x) < 1e-6) || (Math.abs(a.y - q.y) < 1e-6 && Math.abs(q.y - p.y) < 1e-6)) out.pop();
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

const dirOf = (a: Vec, b: Vec): Vec => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) };
};

/** A flow from an element to its own screen: out of the nearest side and back in a little higher. */
function loopRoute(s: Rect, t: Rect, c: number): FlowRoute {
  const cy = s.y + s.height / 2;
  const toRight = right(t) - right(s) <= s.x - t.x;
  const at = { x: toRight ? right(s) : s.x, y: cy };
  const side = toRight ? right(t) : t.x;
  const k = toRight ? 1 : -1;
  const up = cy - 2 * c >= t.y + EDGE_INSET / 2 ? cy - 2 * c : cy + 2 * c;
  const points = simplify([at, { x: side + k * c * 1.5, y: cy }, { x: side + k * c * 1.5, y: up }, { x: side, y: up }]);
  return { points, dir: { x: -k, y: 0 } };
}

/** Routes one request (no spreading). */
export function routeOne(req: RouteRequest, frames: readonly Rect[], opts: RouteOptions = {}, busy: readonly (readonly Vec[])[] = []): FlowRoute {
  const c = opts.clearance ?? 24;
  const band = opts.band ?? 0;
  const obstacles = band ? frames.map((f) => ({ x: f.x, y: f.y - band, width: f.width, height: f.height + band })) : frames;
  const t = frames[req.to];
  if (req.from === req.to) return loopRoute(req.source, t, c);
  const starts = startPorts(req, obstacles, c);
  const from = starts[0]?.at ?? { x: req.source.x + req.source.width / 2, y: req.source.y + req.source.height / 2 };
  const ends = endPorts(t, obstacles[req.to], req.to, obstacles, req.aim ?? from, c);
  const points = search(obstacles, opts.notes ?? [], starts, ends, c, busy);
  if (points && points.length >= 2) return { points, dir: dirOf(points[points.length - 2], points[points.length - 1]) };
  // Every way is closed (frames overlap): the shortest dog-leg, over whatever is there.
  const s = starts[0] ?? { at: from, out: from, dir: 0, cost: 0 };
  const e = ends[0] ?? { at: { x: t.x, y: clamp(from.y, t.y + EDGE_INSET, bottom(t) - EDGE_INSET) }, out: { x: t.x - c, y: from.y }, dir: 0, cost: 0 };
  const pts = simplify([s.at, s.out, { x: s.out.x, y: e.out.y }, e.out, e.at]);
  return { points: pts, dir: pts.length >= 2 ? dirOf(pts[pts.length - 2], pts[pts.length - 1]) : { x: 1, y: 0 } };
}

// ---------- spreading arrows that share a lane ----------

interface Seg {
  r: number;
  /** Segment index: between points k and k + 1. */
  k: number;
  horiz: boolean;
  /** The lane: y of a horizontal segment, x of a vertical one. */
  v: number;
  lo: number;
  hi: number;
  /** Lane group (close parallel lanes with no frame between them); -1 for the stub, which never moves. */
  group: number;
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
/** Right of the travel direction `d` (screen coordinates, y down). */
const rightOf = (d: Vec): Vec => ({ x: -d.y, y: d.x });

/**
 * Where route A must sit relative to route B along segments they share (A's segment `ia`, B's `ib`), walking in
 * direction `aStep` on A (+1 forward, -1 backward) and `bStep` on B: +1 right of A's travel direction, -1 left, 0
 * when the walk does not tell. Two arrows that share a run of lanes keep their order along the whole run; the point
 * where they part decides it (the one that turns off first, or turns to a side, goes on that side), so they never
 * cross inside the run.
 */
function sideAtParting(segs: readonly Seg[][], pts: readonly (readonly Vec[])[], a: number, ia: number, aStep: number, b: number, ib: number, bStep: number): number {
  const segDir = (r: number, j: number, step: number) => unit(step > 0 ? sub(pts[r][j + 1], pts[r][j]) : sub(pts[r][j], pts[r][j + 1]));
  const segEnd = (r: number, j: number, step: number) => (step > 0 ? pts[r][j + 1] : pts[r][j]);
  for (let i = 1; ; i++) {
    const na = ia + i * aStep;
    const nb = ib + i * bStep;
    const sa = segs[a][na];
    const sb = segs[b][nb];
    if (sa && sb && sa.group >= 0 && sa.group === sb.group) continue;
    const pa = ia + (i - 1) * aStep;
    const pb = ib + (i - 1) * bStep;
    const D = segDir(a, pa, aStep);
    const R = rightOf(D);
    const endA = segEnd(a, pa, aStep);
    const endB = segEnd(b, pb, bStep);
    const alongA = endA.x * D.x + endA.y * D.y;
    const alongB = endB.x * D.x + endB.y * D.y;
    const turn = (r: number, j: number, step: number, s: Seg | undefined) => {
      if (!s) return 0;
      const t = segDir(r, j, step);
      return Math.sign(Math.round((t.x * R.x + t.y * R.y) * 1000));
    };
    const tA = turn(a, na, aStep, sa);
    const tB = turn(b, nb, bStep, sb);
    if (alongA < alongB - 1) return tA;
    if (alongB < alongA - 1) return -tB;
    if (tA !== tB) return tA ? tA : -tB;
    return 0;
  }
}

/**
 * Spreads overlapping segments of different routes that run in the same lane (or in close parallel lanes with no frame
 * between them): each gets its own track, `gap` apart (less when the gutter is narrow), ordered so arrows sharing a
 * run of lanes do not cross. Mutates the routes' points; the stub from the element never moves, the last segment
 * slides along the target's side.
 */
export function nudge(routes: FlowRoute[], frames: readonly Rect[], targets: readonly Rect[], opts: RouteOptions = {}): void {
  const gap = opts.gap ?? 10;
  const c = opts.clearance ?? 24;
  const band = opts.band ?? 0;
  const obstacles = band ? frames.map((f) => ({ x: f.x, y: f.y - band, width: f.width, height: f.height + band })) : frames;
  const pts = routes.map((r) => r.points);
  const segs: Seg[][] = pts.map((p, r) =>
    p.slice(0, -1).map((a, k) => {
      const b = p[k + 1];
      const horiz = Math.abs(a.y - b.y) < 1e-6;
      return { r, k, horiz, v: horiz ? a.y : a.x, lo: horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y), hi: horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y), group: -1 };
    }),
  );
  const movable = segs.flatMap((list) => list.slice(1));

  // Lane groups: per orientation, consecutive lanes within 3 clearances with no frame between them (one gutter).
  let nextGroup = 0;
  const groups: Seg[][] = [];
  for (const horiz of [true, false]) {
    const list = movable.filter((s) => s.horiz === horiz).sort((a, b) => a.v - b.v || a.r - b.r || a.k - b.k);
    let cur: Seg[] = [];
    const between = (v0: number, v1: number, lo: number, hi: number) =>
      obstacles.some((o) => {
        const pLo = horiz ? o.y : o.x;
        const pHi = horiz ? bottom(o) : right(o);
        const aLo = horiz ? o.x : o.y;
        const aHi = horiz ? right(o) : bottom(o);
        return pLo < v1 && pHi > v0 && aLo < hi && aHi > lo;
      });
    for (const s of list) {
      const last = cur[cur.length - 1];
      if (last && s.v - last.v <= 3 * c && !between(last.v, s.v, Math.min(...cur.map((x) => x.lo), s.lo), Math.max(...cur.map((x) => x.hi), s.hi))) cur.push(s);
      else {
        if (cur.length) groups.push(cur);
        cur = [s];
      }
    }
    if (cur.length) groups.push(cur);
  }
  for (const g of groups) {
    const id = nextGroup++;
    for (const s of g) s.group = id;
  }

  const moves: { s: Seg; v: number }[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.lo - b.lo || a.r - b.r || a.k - b.k);
    // Clusters of segments overlapping along the lane.
    const clusters: Seg[][] = [];
    let cluster: Seg[] = [];
    let reach = -Infinity;
    for (const s of group) {
      if (cluster.length && s.lo < reach - 1) {
        cluster.push(s);
        reach = Math.max(reach, s.hi);
      } else {
        if (cluster.length) clusters.push(cluster);
        cluster = [s];
        reach = s.hi;
      }
    }
    if (cluster.length) clusters.push(cluster);
    for (const cl of clusters) {
      if (new Set(cl.map((s) => s.r)).size < 2) continue;
      const horiz = cl[0].horiz;
      const v = cl.reduce((t, s) => t + s.v, 0) / cl.length;
      const lo = Math.min(...cl.map((s) => s.lo));
      const hi = Math.max(...cl.map((s) => s.hi));
      // Room on each side: the nearest frame across the cluster's span.
      let roomLo = -Infinity;
      let roomHi = Infinity;
      let inside = false;
      for (const o of obstacles) {
        const oLo = horiz ? o.x : o.y;
        const oHi = horiz ? right(o) : bottom(o);
        if (!(oLo < hi - 0.5 && oHi > lo + 0.5)) continue;
        const pLo = horiz ? o.y : o.x;
        const pHi = horiz ? bottom(o) : right(o);
        if (pHi <= v + 0.01) roomLo = Math.max(roomLo, pHi);
        else if (pLo >= v - 0.01) roomHi = Math.min(roomHi, pLo);
        else inside = true;
      }
      if (inside) continue;
      for (const s of cl) {
        if (s.k + 2 !== pts[s.r].length) continue;
        const t = targets[s.r];
        roomLo = Math.max(roomLo, (horiz ? t.y : t.x) + EDGE_INSET / 2);
        roomHi = Math.min(roomHi, (horiz ? bottom(t) : right(t)) - EDGE_INSET / 2);
      }
      const n = cl.length;
      if (!Number.isFinite(roomLo)) roomLo = v - n * gap * 2;
      if (!Number.isFinite(roomHi)) roomHi = v + n * gap * 2;
      if (roomHi - roomLo < 2) continue;
      // Arrowheads side by side on a frame's edge need more room than lines.
      const ends = cl.some((s) => s.k + 2 === pts[s.r].length);
      const step = Math.min(ends ? 2 * gap : gap, (roomHi - roomLo) / (n + 1));
      const span = (n - 1) * step;
      // Keep the clearance from the frames when there is room for it (a lane over a row), at least one step otherwise.
      const pad = Math.min(c, Math.max(step, (roomHi - roomLo - span) / 2));
      const first = clamp(v - span / 2, roomLo + pad, roomHi - pad - span);
      const order = [...cl].sort((a, b) => {
        if (a.r === b.r) return a.k - b.k;
        const pa = pts[a.r];
        const pb = pts[b.r];
        const da = horiz ? Math.sign(pa[a.k + 1].x - pa[a.k].x) : Math.sign(pa[a.k + 1].y - pa[a.k].y);
        const db = horiz ? Math.sign(pb[b.k + 1].x - pb[b.k].x) : Math.sign(pb[b.k + 1].y - pb[b.k].y);
        const bStep = da === db ? 1 : -1;
        const fwd = sideAtParting(segs, pts, a.r, a.k, 1, b.r, b.k, bStep);
        const side = fwd || -sideAtParting(segs, pts, a.r, a.k, -1, b.r, b.k, -bStep);
        // Right of travel, on the lane's axis: +y for a horizontal segment going +x, -x for a vertical one going +y.
        const comp = horiz ? da : -da;
        return side * comp || a.r - b.r;
      });
      order.forEach((s, i) => moves.push({ s, v: first + i * step }));
    }
  }
  for (const { s, v } of moves) {
    const p = routes[s.r].points;
    const set = (q: Vec) => (s.horiz ? (q.y = v) : (q.x = v));
    set(p[s.k]);
    set(p[s.k + 1]);
  }
}

/**
 * Routes every request and spreads the ones sharing lanes. Shorter arrows are routed first (they get the direct
 * lanes); each later one pays for running next to the earlier ones, so crowded gutters are avoided when there is
 * another way.
 */
export function routeFlows(reqs: readonly RouteRequest[], frames: readonly Rect[], opts: RouteOptions = {}): FlowRoute[] {
  const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const est = reqs.map((r) => {
    const a = centre(r.source);
    const b = centre(frames[r.to]);
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  });
  const order = reqs.map((_, i) => i).sort((a, b) => est[a] - est[b] || a - b);
  const routes: FlowRoute[] = new Array(reqs.length);
  const busy: Vec[][] = [];
  for (const i of order) {
    routes[i] = routeOne(reqs[i], frames, opts, busy);
    busy.push(routes[i].points);
  }
  nudge(routes, frames, reqs.map((r) => frames[r.to]), opts);
  return routes;
}

// ---------- labels, drawing, picking ----------

/**
 * Where each route's label goes (its centre), or null without a label: on the longest clear stretch of the route (not
 * the stub from the element), off every rect of `avoid` (frames, notes) and off the labels placed before it.
 * `sizes[i]`: the label's size in document units, or null.
 */
export function placeLabels(routes: readonly FlowRoute[], sizes: readonly ({ width: number; height: number } | null)[], avoid: readonly Rect[]): (Vec | null)[] {
  const placed: Rect[] = [];
  return routes.map((r, i) => {
    const size = sizes[i];
    if (!size) return null;
    const box = (p: Vec): Rect => ({ x: p.x - size.width / 2, y: p.y - size.height / 2, width: size.width, height: size.height });
    const segs = r.points.slice(0, -1).map((a, k) => ({ a, b: r.points[k + 1], k, len: Math.abs(r.points[k + 1].x - a.x) + Math.abs(r.points[k + 1].y - a.y) }));
    const order = (segs.length > 1 ? segs.slice(1) : segs).sort((x, y) => y.len - x.len || x.k - y.k);
    const clear = (b: Rect) => !avoid.some((o) => rectsOverlap(b, o)) && !placed.some((o) => rectsOverlap(b, o));
    for (const s of order) {
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
        const p = { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
        const b = box(p);
        if (clear(b)) {
          placed.push(b);
          return p;
        }
      }
    }
    const p = routeMidpoint(r.points);
    placed.push(box(p));
    return p;
  });
}

/** The point halfway along a polyline. */
export function routeMidpoint(points: readonly Vec[]): Vec {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l >= left && l > 0) return { x: a.x + ((b.x - a.x) * left) / l, y: a.y + ((b.y - a.y) * left) / l };
    left -= l;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from `p` to a route. */
export function distanceToRoute(route: Pick<FlowRoute, 'points'>, p: Vec): number {
  let best = Infinity;
  for (let i = 1; i < route.points.length; i++) best = Math.min(best, distToSegment(p, route.points[i - 1], route.points[i]));
  return best;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** SVG path data of a polyline with rounded corners (radius `r`, smaller where segments are short). */
export function routePath(points: readonly Vec[], r: number): string {
  if (!points.length) return '';
  const d = [`M${fmt(points[0].x)},${fmt(points[0].y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const lin = Math.hypot(b.x - a.x, b.y - a.y);
    const lout = Math.hypot(c.x - b.x, c.y - b.y);
    const k = Math.min(r, lin / 2, lout / 2);
    if (k < 0.5 || !lin || !lout) {
      d.push(`L${fmt(b.x)},${fmt(b.y)}`);
      continue;
    }
    const p = { x: b.x - ((b.x - a.x) / lin) * k, y: b.y - ((b.y - a.y) / lin) * k };
    const q = { x: b.x + ((c.x - b.x) / lout) * k, y: b.y + ((c.y - b.y) / lout) * k };
    d.push(`L${fmt(p.x)},${fmt(p.y)}`, `Q${fmt(b.x)},${fmt(b.y)} ${fmt(q.x)},${fmt(q.y)}`);
  }
  const z = points[points.length - 1];
  if (points.length > 1) d.push(`L${fmt(z.x)},${fmt(z.y)}`);
  return d.join(' ');
}
