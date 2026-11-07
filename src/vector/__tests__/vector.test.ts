import { beforeAll, describe, expect, it } from 'vitest';
import { createEllipse, createGroup, createPolygon, createRect, cubicAt, IDENTITY, subpathsBounds, type BezierPoint, type SubPath } from '@/model';
import { constrain45, inferPointType, nearestSegment, segmentCubic, splitCubic, type Cubic } from '../geometry';
import {
  anchorKey,
  deletePoints,
  insertPoint,
  joinEndpoints,
  joinOpenSubpaths,
  moveAnchors,
  moveHandle,
  reverseSubpaths,
  toggleSmooth,
} from '../pathEdit';
import { bottomStyleSource, convertTree, pathFromWorld, recenterPath, shapeToPath, worldShapes } from '../convert';
import { booleanOp, fitCurve, loadPaper, outlineStroke, polygonToSmoothSubpaths, simplifySubpaths } from '../paperOps';
import { brushOutline, decimate, shouldClose } from '../freehand';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const pt = (x: number, y: number, extra: Partial<BezierPoint> = {}): BezierPoint => ({ x, y, type: 'corner', ...extra });
const line = (...pts: [number, number][]): SubPath => ({ closed: false, points: pts.map(([x, y]) => pt(x, y)) });
const square = (x: number, y: number, s: number): SubPath => ({
  closed: true,
  points: [pt(x, y), pt(x + s, y), pt(x + s, y + s), pt(x, y + s)],
});
const area = (sp: SubPath[]) =>
  sp.reduce((sum, s) => {
    let a = 0;
    const p = s.points;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a += p[i].x * q.y - q.x * p[i].y;
    }
    return sum + a / 2;
  }, 0);

describe('geometry', () => {
  it('splits a cubic exactly (both halves retrace the original)', () => {
    const c: Cubic = [
      { x: 0, y: 0 },
      { x: 10, y: 30 },
      { x: 40, y: -20 },
      { x: 50, y: 10 },
    ];
    const { left, right } = splitCubic(c, 0.3);
    for (const u of [0, 0.25, 0.5, 1]) {
      const a = cubicAt(left[0], left[1], left[2], left[3], u);
      const b = cubicAt(c[0], c[1], c[2], c[3], 0.3 * u);
      close(a.x, b.x);
      close(a.y, b.y);
      const r = cubicAt(right[0], right[1], right[2], right[3], u);
      const o = cubicAt(c[0], c[1], c[2], c[3], 0.3 + 0.7 * u);
      close(r.x, o.x);
      close(r.y, o.y);
    }
  });

  it('finds the nearest segment and parameter', () => {
    const hit = nearestSegment([square(0, 0, 100)], { x: 30, y: 102 }, 5);
    expect(hit?.segment).toBe(2); // bottom edge (100,100) → (0,100)
    close(hit!.t, 0.7, 1e-3);
    expect(nearestSegment([square(0, 0, 100)], { x: 50, y: 50 }, 5)).toBeNull();
  });

  it('classifies point types and constrains to 45°', () => {
    expect(inferPointType(pt(0, 0, { in: { x: -5, y: 0 }, out: { x: 5, y: 0 } }))).toBe('symmetric');
    expect(inferPointType(pt(0, 0, { in: { x: -2, y: 0 }, out: { x: 5, y: 0 } }))).toBe('smooth');
    expect(inferPointType(pt(0, 0, { in: { x: 0, y: -2 }, out: { x: 5, y: 0 } }))).toBe('corner');
    const c = constrain45({ x: 0, y: 0 }, { x: 10, y: 1 });
    close(c.y, 0);
    const d = constrain45({ x: 0, y: 0 }, { x: 10, y: 9 });
    close(d.x, d.y);
  });
});

describe('path edits', () => {
  it('inserts a point on a curve without changing its shape', () => {
    const sp: SubPath = {
      closed: false,
      points: [pt(0, 0, { out: { x: 0, y: 50 } }), pt(100, 0, { in: { x: 100, y: 50 } })],
    };
    const before = segmentCubic(sp, 0);
    const { subpaths, ref } = insertPoint([sp], 0, 0, 0.5);
    expect(ref).toEqual({ s: 0, i: 1 });
    const np = subpaths[0].points[1];
    const mid = cubicAt(before[0], before[1], before[2], before[3], 0.5);
    close(np.x, mid.x);
    close(np.y, mid.y);
    expect(np.type).toBe('smooth');
    const a = segmentCubic(subpaths[0], 0);
    const p = cubicAt(a[0], a[1], a[2], a[3], 0.5);
    const q = cubicAt(before[0], before[1], before[2], before[3], 0.25);
    close(p.x, q.x);
    close(p.y, q.y);
  });

  it('inserts on a line segment and on the closing segment', () => {
    const { subpaths } = insertPoint([square(0, 0, 10)], 0, 3, 0.5);
    expect(subpaths[0].points).toHaveLength(5);
    expect(subpaths[0].points[4]).toMatchObject({ x: 0, y: 5 });
  });

  it('moves anchors with their handles', () => {
    const sp: SubPath = { closed: false, points: [pt(0, 0, { out: { x: 5, y: 5 } }), pt(10, 0)] };
    const out = moveAnchors([sp], [anchorKey({ s: 0, i: 0 })], { x: 1, y: 2 });
    expect(out[0].points[0]).toMatchObject({ x: 1, y: 2, out: { x: 6, y: 7 } });
    expect(sp.points[0].x).toBe(0); // input untouched
  });

  it('moves handles per point type; Alt breaks symmetry', () => {
    const sym: SubPath = { closed: false, points: [pt(0, 0, { type: 'symmetric', in: { x: -5, y: 0 }, out: { x: 5, y: 0 } })] };
    let out = moveHandle([sym], { s: 0, i: 0 }, 'out', { x: 0, y: 10 });
    expect(out[0].points[0].in).toEqual({ x: 0, y: -10 });
    const smooth: SubPath = { closed: false, points: [pt(0, 0, { type: 'smooth', in: { x: -2, y: 0 }, out: { x: 5, y: 0 } })] };
    out = moveHandle([smooth], { s: 0, i: 0 }, 'out', { x: 0, y: 10 });
    close(out[0].points[0].in!.x, 0);
    close(out[0].points[0].in!.y, -2);
    out = moveHandle([sym], { s: 0, i: 0 }, 'out', { x: 0, y: 10 }, { breakSymmetry: true });
    expect(out[0].points[0].type).toBe('corner');
    expect(out[0].points[0].in).toEqual({ x: -5, y: 0 });
  });

  it('toggles corner ↔ smooth', () => {
    const sp = line([0, 0], [10, 10], [20, 0]);
    const smooth = toggleSmooth([sp], { s: 0, i: 1 });
    const p = smooth[0].points[1];
    expect(p.type).toBe('smooth');
    close(p.in!.y, 10);
    close(p.out!.y, 10);
    const back = toggleSmooth(smooth, { s: 0, i: 1 });
    expect(back[0].points[1].in).toBeUndefined();
    expect(back[0].points[1].type).toBe('corner');
  });

  it('deletes points and drops degenerate subpaths', () => {
    const out = deletePoints([square(0, 0, 10), line([0, 0], [5, 5])], ['0:1', '1:0']);
    expect(out).toHaveLength(1);
    expect(out[0].points).toHaveLength(3);
  });

  it('reverses direction keeping the closed start point', () => {
    const sp: SubPath = { closed: true, points: [pt(0, 0, { out: { x: 1, y: 0 } }), pt(10, 0, { in: { x: 9, y: 0 } }), pt(10, 10)] };
    const r = reverseSubpaths([sp])[0];
    expect(r.points.map((p) => p.x)).toEqual([0, 10, 10]);
    expect(r.points.map((p) => p.y)).toEqual([0, 10, 0]);
    expect(r.points[0].in).toEqual({ x: 1, y: 0 });
    expect(r.points[2].out).toEqual({ x: 9, y: 0 });
    expect(Math.sign(area(reverseSubpaths([square(0, 0, 10)])))).toBe(-Math.sign(area([square(0, 0, 10)])));
  });

  it('joins open subpaths at their nearest endpoints and closes a single one', () => {
    const joined = joinOpenSubpaths([line([0, 0], [10, 0]), line([20, 0], [11, 0])]);
    expect(joined).toHaveLength(1);
    expect(joined[0].points.map((p) => p.x)).toEqual([0, 10, 11, 20]);
    const closed = joinOpenSubpaths([line([0, 0], [10, 0], [10, 10])]);
    expect(closed[0].closed).toBe(true);
    const coincident = joinOpenSubpaths([line([0, 0], [10, 0], [0, 0])]);
    expect(coincident[0].points).toHaveLength(2);
  });

  it('joins two selected endpoints', () => {
    const out = joinEndpoints([line([0, 0], [10, 0]), line([10, 5], [20, 5])], { s: 0, i: 0 }, { s: 1, i: 0 });
    expect(out).toHaveLength(1);
    expect(out![0].points.map((p) => p.x)).toEqual([10, 0, 10, 20]);
    expect(joinEndpoints([line([0, 0], [5, 0], [10, 0])], { s: 0, i: 1 }, { s: 0, i: 2 })).toBeNull();
  });
});

describe('convert', () => {
  it('converts shapes to paths keeping id, transform and paint', () => {
    const r = createRect({ width: 40, height: 20, transform: { x: 100, y: 50, rotation: 30 } });
    const p = shapeToPath(r)!;
    expect(p.type).toBe('path');
    expect(p.id).toBe(r.id);
    expect(p.transform).toEqual(r.transform);
    expect(p.fill).toEqual(r.fill);
    expect(subpathsBounds(p.subpaths)).toEqual({ x: -20, y: -10, width: 40, height: 20 });
    expect(shapeToPath(createPolygon({ sides: 6 }))!.subpaths[0].points).toHaveLength(6);
    const g = createGroup({ children: [createEllipse(), r] });
    const cg = convertTree(g);
    expect(cg.type === 'group' && cg.children.every((c) => c.type === 'path')).toBe(true);
  });

  it('collects world shapes through groups and finds the bottom style', () => {
    const a = createRect({ width: 10, height: 10, transform: { x: 5, y: 5 } });
    const g = createGroup({ children: [a], transform: { x: 100, y: 0 } });
    const shapes = worldShapes(g, IDENTITY);
    expect(subpathsBounds(shapes[0].subpaths)).toEqual({ x: 100, y: 0, width: 10, height: 10 });
    expect(bottomStyleSource(g)?.id).toBe(a.id);
  });

  it('builds centered paths from world geometry and recenters', () => {
    const p = pathFromWorld([square(10, 10, 20)], IDENTITY);
    expect(p.transform).toMatchObject({ x: 20, y: 20 });
    expect(subpathsBounds(p.subpaths)).toEqual({ x: -10, y: -10, width: 20, height: 20 });
    const off = { ...p, subpaths: [square(0, 0, 20)], transform: { ...p.transform, x: 0, y: 0 } };
    const rc = recenterPath(off);
    expect(rc.transform).toMatchObject({ x: 10, y: 10 });
  });
});

describe('paper ops', () => {
  let scope: paper.PaperScope;
  beforeAll(async () => {
    scope = await loadPaper();
  });
  const ws = (sp: SubPath) => [{ subpaths: [sp], fillRule: 'nonzero' as const, source: createRect() }];

  it('unite / subtract / intersect / exclude', () => {
    const a = ws(square(0, 0, 10));
    const b = ws(square(5, 5, 10));
    close(Math.abs(area(booleanOp(scope, [a, b], 'unite'))), 175, 1e-6);
    close(Math.abs(area(booleanOp(scope, [a, b], 'subtract'))), 75, 1e-6);
    close(Math.abs(area(booleanOp(scope, [a, b], 'intersect'))), 25, 1e-6);
    const ex = booleanOp(scope, [a, b], 'exclude');
    // Exclude: two L-shapes (area 150 total when holes are counted by orientation).
    expect(ex.length).toBeGreaterThanOrEqual(2);
    close(Math.abs(area(ex)), 150, 1e-6);
  });

  it('subtract removes every front operand from the bottom one', () => {
    const r = booleanOp(scope, [ws(square(0, 0, 30)), ws(square(0, 0, 10)), ws(square(20, 20, 10))], 'subtract');
    close(Math.abs(area(r)), 700, 1e-6);
  });

  it('outlines a stroke', () => {
    const out = outlineStroke(scope, [line([0, 0], [100, 0])], { width: 10, cap: 'butt', join: 'miter' });
    expect(out).toHaveLength(1);
    close(Math.abs(area(out)), 1000, 1e-3);
    expect(subpathsBounds(out)).toEqual({ x: 0, y: -5, width: 100, height: 10 });
    const sq = outlineStroke(scope, [square(0, 0, 100)], { width: 10, cap: 'butt', join: 'miter' });
    // Ring: outer 110² minus inner 90².
    close(Math.abs(area(sq)), 110 * 110 - 90 * 90, 1e-3);
    const round = outlineStroke(scope, [line([0, 0], [100, 0])], { width: 10, cap: 'round', join: 'round' });
    close(subpathsBounds(round)!.width, 110, 0.05);
  });

  it('simplifies and fits curves', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 8) * 20 }));
    const fit = fitCurve(scope, pts, 2, false);
    expect(fit.points.length).toBeLessThan(15);
    expect(fit.points.some((p) => p.out)).toBe(true);
    const many = simplifySubpaths(scope, [{ closed: false, points: pts.map((p) => pt(p.x, p.y)) }], 1);
    expect(many[0].points.length).toBeLessThan(20);
  });

  it('cleans a brush outline into closed subpaths', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i * 5, y: 0 }));
    const outline = brushOutline(pts, { size: 12, thinning: 0.5 });
    const sp = polygonToSmoothSubpaths(scope, outline);
    expect(sp.length).toBeGreaterThan(0);
    expect(sp.every((s) => s.closed)).toBe(true);
  });
});

describe('freehand', () => {
  it('decimates and decides closing', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 0.1, y: 0 }));
    expect(decimate(pts, 0.5)).toHaveLength(3);
    const loop = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 2, y: 2 },
    ];
    expect(shouldClose(loop, 8)).toBe(true);
    expect(shouldClose([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 8)).toBe(false);
  });
});
