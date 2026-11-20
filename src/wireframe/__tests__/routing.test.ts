import { describe, expect, it } from 'vitest';
import type { Rect, Vec } from '@/model';
import { distanceToRoute, EDGE_INSET, nudge, placeLabels, rectsOverlap, routeFlows, routeOne, routePath, segmentHitsRect, type FlowRoute, type RouteRequest } from '../routing';

const PHONE = { width: 390, height: 844 };
/** A menu and `n` screens in a row, 80 apart (the Hoard benchmark layout). */
const row = (n: number, gutter = 80): Rect[] => Array.from({ length: n + 1 }, (_, i) => ({ x: i * (PHONE.width + gutter), y: 0, ...PHONE }));
/** A list row inside frame `f` at `y`, edge to edge. */
const rowIn = (f: Rect, y: number): Rect => ({ x: f.x, y: f.y + y, width: f.width, height: 56 });
/** The back button of frame `f` (top-left). */
const backIn = (f: Rect): Rect => ({ x: f.x + 8, y: f.y + 24, width: 40, height: 40 });

/** The Hoard benchmark: the menu (frame 0) opens each screen; each screen's back goes to the menu. */
function hoard(n = 8): { frames: Rect[]; reqs: RouteRequest[] } {
  const frames = row(n);
  const reqs: RouteRequest[] = [];
  for (let i = 1; i <= n; i++) reqs.push({ source: rowIn(frames[0], 100 + i * 64), from: 0, to: i });
  for (let i = 1; i <= n; i++) reqs.push({ source: backIn(frames[i]), from: i, to: 0 });
  return { frames, reqs };
}

const grow = (r: Rect, band: number): Rect => ({ x: r.x, y: r.y - band, width: r.width, height: r.height + band });
const onEdge = (p: Vec, r: Rect) =>
  ((Math.abs(p.x - r.x) < 1e-6 || Math.abs(p.x - r.x - r.width) < 1e-6) && p.y >= r.y - 1e-6 && p.y <= r.y + r.height + 1e-6) ||
  ((Math.abs(p.y - r.y) < 1e-6 || Math.abs(p.y - r.y - r.height) < 1e-6) && p.x >= r.x - 1e-6 && p.x <= r.x + r.width + 1e-6);

/** Every segment is axis-aligned and misses every frame but the route's own two (with the name strip above each). */
function expectClear(routes: FlowRoute[], reqs: RouteRequest[], frames: Rect[], band = 0) {
  routes.forEach((route, i) => {
    const req = reqs[i];
    const p = route.points;
    expect(p.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < p.length; k++) expect(p[k].x === p[k - 1].x || p[k].y === p[k - 1].y).toBe(true);
    frames.forEach((f, j) => {
      if (j === req.from || j === req.to) return;
      for (let k = 1; k < p.length; k++) expect(segmentHitsRect(p[k - 1], p[k], grow(f, band)), `route ${i} segment ${k} over frame ${j}`).toBe(false);
    });
    // The target is only touched by the last segment, which ends on its edge.
    const t = frames[req.to];
    expect(onEdge(p[p.length - 1], t)).toBe(true);
    for (let k = 1; k < p.length - 1; k++) expect(segmentHitsRect(p[k - 1], p[k], t)).toBe(false);
  });
}

describe('routing', () => {
  it('neighbours: a straight arrow from the row to the next frame’s near side', () => {
    const frames = row(1);
    const r = routeOne({ source: rowIn(frames[0], 200), from: 0, to: 1 }, frames);
    expect(r.points).toEqual([
      { x: 390, y: 228 },
      { x: 470, y: 228 },
    ]);
    expect(r.dir).toEqual({ x: 1, y: 0 });
  });

  it('the Hoard benchmark: no arrow passes over a screen other than its own two', () => {
    const { frames, reqs } = hoard();
    for (const band of [0, 40]) expectClear(routeFlows(reqs, frames, { band }), reqs, frames, band);
  });

  it('back arrows to a far screen go around the row (above, over the name strips), not through it', () => {
    const { frames, reqs } = hoard();
    const band = 40;
    const routes = routeFlows(reqs, frames, { band });
    const back = routes.slice(9); // screen 1 is next to the menu: straight
    for (const r of back) {
      expect(r.dir.x).toBe(-1); // into the menu's right side
      expect(Math.min(...r.points.map((p) => p.y))).toBeLessThan(-band); // over the name strips
    }
  });

  it('frames in a grid: routes go through the gutters between rows and columns', () => {
    const frames: Rect[] = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) frames.push({ x: i * 500, y: j * 1000, ...PHONE });
    const reqs: RouteRequest[] = [
      { source: rowIn(frames[0], 300), from: 0, to: 8 },
      { source: rowIn(frames[8], 300), from: 8, to: 0 },
      { source: rowIn(frames[2], 300), from: 2, to: 6 },
      { source: backIn(frames[7]), from: 7, to: 1 },
      { source: rowIn(frames[3], 100), from: 3, to: 5 },
    ];
    expectClear(routeFlows(reqs, frames, { band: 30 }), reqs, frames, 30);
  });

  it('a flow to its own screen loops out of the nearest side and back in', () => {
    const frames = row(1);
    const r = routeOne({ source: { x: 300, y: 400, width: 80, height: 40 }, from: 0, to: 0 }, frames);
    expect(r.points[0]).toEqual({ x: 380, y: 420 });
    expect(r.points[r.points.length - 1].x).toBe(390);
    expect(r.dir).toEqual({ x: -1, y: 0 });
  });

  it('a part in a row leaves vertically', () => {
    const frames = [{ x: 0, y: 0, ...PHONE }, { x: 0, y: 1000, ...PHONE }];
    const tab = { x: 100, y: 780, width: 90, height: 64 };
    const r = routeOne({ source: tab, from: 0, to: 1, vertical: true }, frames);
    expect(r.points[0]).toEqual({ x: 145, y: 844 }); // the bottom centre: the target is below
    expect(r.points[1].x).toBe(145);
    expectClear([r], [{ source: tab, from: 0, to: 1 }], frames);
  });

  it('goes around a note when that is not much longer', () => {
    const frames = row(2);
    const note = { x: 400, y: 180, width: 60, height: 120 }; // in the first gutter, where the arrow would pass
    const req = { source: rowIn(frames[0], 300), from: 0, to: 2 };
    const with_ = routeOne(req, frames, { notes: [note] });
    for (let k = 1; k < with_.points.length; k++) expect(segmentHitsRect(with_.points[k - 1], with_.points[k], note)).toBe(false);
  });

  it('spreads arrows sharing a lane: overlapping parallel segments of different arrows never coincide, all inside the gutter', () => {
    const { frames, reqs } = hoard();
    const routes = routeFlows(reqs, frames, { band: 40, gap: 10 });
    const segs = routes.flatMap((r, i) =>
      r.points.slice(1, -1).map((a, k) => ({ i, a, b: r.points[k + 2] })).filter(({ a, b }) => a.x !== b.x || a.y !== b.y),
    );
    for (let m = 0; m < segs.length; m++) {
      for (let n = m + 1; n < segs.length; n++) {
        const s = segs[m];
        const t = segs[n];
        if (s.i === t.i) continue;
        const horiz = s.a.y === s.b.y;
        if (horiz !== (t.a.y === t.b.y)) continue;
        const [sl, sh] = horiz ? [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)] : [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)];
        const [tl, th] = horiz ? [Math.min(t.a.x, t.b.x), Math.max(t.a.x, t.b.x)] : [Math.min(t.a.y, t.b.y), Math.max(t.a.y, t.b.y)];
        if (Math.min(sh, th) - Math.max(sl, tl) <= 1) continue;
        expect(Math.abs(horiz ? s.a.y - t.a.y : s.a.x - t.a.x), `arrows ${s.i} and ${t.i}`).toBeGreaterThan(0.5);
      }
    }
    expectClear(routes, reqs, frames, 40);
  });

  it('nests arrows sharing a run of lanes: the longest back arrow runs outermost', () => {
    const { frames, reqs } = hoard();
    const routes = routeFlows(reqs, frames, { band: 40 });
    const tops = routes.slice(8).map((r) => Math.min(...r.points.map((p) => p.y)));
    // Screen 1 is next to the menu (a straight arrow); 2..8 go over the row, the farther the higher.
    for (let i = 2; i < tops.length; i++) expect(tops[i]).toBeLessThan(tops[i - 1]);
  });

  it('nudge keeps the stub from the element and slides the last segment along the target side only', () => {
    const frames = row(1);
    const routes: FlowRoute[] = [0, 1].map(() => ({
      points: [
        { x: 200, y: 100 },
        { x: 390, y: 100 },
        { x: 430, y: 100 },
        { x: 430, y: 300 },
        { x: 470, y: 300 },
      ],
      dir: { x: 1, y: 0 },
    }));
    routes[1].points[0] = { x: 200, y: 110 };
    nudge(routes, frames, [frames[1], frames[1]]);
    const [a, b] = routes;
    expect(a.points[0]).toEqual({ x: 200, y: 100 });
    expect(Math.abs(a.points[3].x - b.points[3].x)).toBeGreaterThan(1);
    expect(Math.abs(a.points[4].y - b.points[4].y)).toBeGreaterThan(1);
    for (const r of routes) {
      expect(r.points[4].x).toBe(470);
      expect(r.points[4].y).toBeGreaterThanOrEqual(EDGE_INSET / 2);
    }
  });

  it('is deterministic', () => {
    const { frames, reqs } = hoard();
    expect(routeFlows(reqs, frames, { band: 40 })).toEqual(routeFlows(reqs, frames, { band: 40 }));
  });

  it('places labels on the clear part of the path, off frames, notes and each other', () => {
    const { frames, reqs } = hoard();
    const routes = routeFlows(reqs, frames, { band: 40 });
    const note = { x: 400, y: 900, width: 200, height: 300 };
    const avoid = [...frames.map((f) => grow(f, 40)), note];
    const size = { width: 120, height: 24 };
    // No label on some, and none on the two arrows that only cross the 80 px gutter next to the menu (no room).
    const none = (i: number) => i % 3 === 0 || i === 0 || i === 8;
    const spots = placeLabels(routes, routes.map((_, i) => (none(i) ? null : size)), avoid);
    const boxes: Rect[] = [];
    spots.forEach((p, i) => {
      if (none(i)) return expect(p).toBeNull();
      expect(p).not.toBeNull();
      const box = { x: p!.x - 60, y: p!.y - 12, ...size };
      expect(distanceToRoute(routes[i], p!)).toBeLessThan(0.01); // on the arrow
      for (const o of avoid) expect(rectsOverlap(box, o), `label ${i}`).toBe(false);
      for (const o of boxes) expect(rectsOverlap(box, o), `label ${i} on another`).toBe(false);
      boxes.push(box);
    });
  });

  it('draws rounded corners and measures distance to the route', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(routePath(pts, 8)).toBe('M0,0 L92,0 Q100,0 100,8 L100,100');
    expect(distanceToRoute({ points: pts }, { x: 50, y: 10 })).toBe(10);
    expect(distanceToRoute({ points: pts }, { x: 110, y: 50 })).toBe(10);
  });

  it('is fast: 10 screens and 40 arrows in a few milliseconds each', () => {
    const frames: Rect[] = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 5; i++) frames.push({ x: i * 480, y: j * 1000, ...PHONE });
    const reqs: RouteRequest[] = [];
    for (let k = 0; k < 40; k++) {
      const from = k % 10;
      const to = (k * 7 + 3) % 10;
      reqs.push({ source: rowIn(frames[from], 80 + (k % 10) * 64), from, to: to === from ? (to + 1) % 10 : to });
    }
    routeFlows(reqs, frames, { band: 30 });
    const t = performance.now();
    const routes = routeFlows(reqs, frames, { band: 30 });
    const ms = performance.now() - t;
    expectClear(routes, reqs, frames, 30);
    expect(ms).toBeLessThan(400); // generous under CI load; ~10 ms on a quiet machine
  });
});
