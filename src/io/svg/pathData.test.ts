import { describe, expect, it } from 'vitest';
import { flattenSubpaths, subpathsBounds, subpathsToD, translate } from '@/model';
import { arcToCubics, parsePathData, transformSubpaths } from './pathData';
import { decompose, parseTransform } from './transformAttr';

const close = (a: number, b: number, eps = 1e-3) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('parsePathData', () => {
  it('parses absolute lines and closes', () => {
    const sp = parsePathData('M0 0 L10 0 L10 10 Z');
    expect(sp).toHaveLength(1);
    expect(sp[0].closed).toBe(true);
    expect(sp[0].points.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it('handles relative commands, H/V and implicit repetition', () => {
    const sp = parsePathData('m10 10 h5 v5 h-5z m20 0 l1 1 2 2');
    expect(sp).toHaveLength(2);
    expect(sp[0].points.map((p) => [p.x, p.y])).toEqual([
      [10, 10],
      [15, 10],
      [15, 15],
      [10, 15],
    ]);
    // After z the current point returns to 10,10; m20 0 is relative to it.
    expect(sp[1].points.map((p) => [p.x, p.y])).toEqual([
      [30, 10],
      [31, 11],
      [33, 13],
    ]);
  });

  it('implicit lineto after moveto', () => {
    const sp = parsePathData('M0 0 10 0 10 10');
    expect(sp[0].points).toHaveLength(3);
  });

  it('parses compact numbers', () => {
    const sp = parsePathData('M.5.5L-1-2l1e1-1.5e0');
    expect(sp[0].points.map((p) => [p.x, p.y])).toEqual([
      [0.5, 0.5],
      [-1, -2],
      [9, -3.5],
    ]);
  });

  it('cubic C and smooth S reflect the control point', () => {
    const sp = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    const [a, b, c] = sp[0].points;
    expect(a.out).toEqual({ x: 0, y: 10 });
    expect(b.in).toEqual({ x: 10, y: 10 });
    expect(b.out).toEqual({ x: 10, y: -10 }); // reflection of 10,10 around 10,0
    expect(c.in).toEqual({ x: 20, y: -10 });
    expect(b.type).toBe('symmetric');
  });

  it('quadratic Q and T become cubics', () => {
    const sp = parsePathData('M0 0 Q10 10 20 0 T40 0');
    const [a, b, c] = sp[0].points;
    close(a.out!.x, 20 / 3);
    close(a.out!.y, 20 / 3);
    close(b.in!.x, 20 - 20 / 3);
    // T reflects 10,10 around 20,0 → 30,-10.
    close(b.out!.x, 20 + (2 / 3) * 10);
    close(b.out!.y, (2 / 3) * -10);
    expect(c).toMatchObject({ x: 40, y: 0 });
  });

  it('arcs become cubics on the circle', () => {
    const sp = parsePathData('M10 0 A10 10 0 0 1 -10 0');
    const flat = flattenSubpaths(sp, 32)[0].points;
    for (const p of flat) close(Math.hypot(p.x, p.y), 10, 0.02);
    // Sweep flag 1 from (10,0) to (-10,0) passes through y = +10.
    const b = subpathsBounds(sp)!;
    close(b.y + b.height, 10, 0.01);
    close(b.y, 0, 0.01);
  });

  it('parses compact arc flags (a1 1 0 00 1 1)', () => {
    const sp = parsePathData('M0 0a5 5 0 105 5');
    expect(sp[0].points.at(-1)).toMatchObject({ x: 5, y: 5 });
    const b = subpathsBounds(sp)!;
    // Large arc: the bounding box is bigger than the chord box.
    expect(b.width).toBeGreaterThan(6);
  });

  it('degenerate arcs: zero radius is a line, same endpoint is skipped', () => {
    expect(arcToCubics(0, 0, 0, 5, 0, false, true, 10, 0)).toHaveLength(1);
    expect(arcToCubics(3, 3, 5, 5, 0, false, true, 3, 3)).toHaveLength(0);
  });

  it('scales radii up when too small', () => {
    const cubics = arcToCubics(0, 0, 1, 1, 0, false, true, 10, 0);
    const end = cubics.at(-1)![2];
    expect(end).toEqual({ x: 10, y: 0 });
    // Half circle of radius 5.
    expect(cubics).toHaveLength(2);
  });

  it('full circle from two arcs closes cleanly', () => {
    const sp = parsePathData('M-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0z');
    expect(sp[0].closed).toBe(true);
    expect(sp[0].points[0].in).toBeDefined();
    const b = subpathsBounds(sp)!;
    close(b.width, 20, 0.01);
    close(b.height, 20, 0.01);
  });

  it('stops at invalid data and keeps what parsed', () => {
    const sp = parsePathData('M0 0 L10 10 L20 # 30');
    expect(sp[0].points).toHaveLength(2);
    expect(parsePathData('')).toEqual([]);
    expect(parsePathData('garbage')).toEqual([]);
  });

  it('round-trips through subpathsToD', () => {
    const d = 'M0 0C0 10 10 10 10 0L20 0Z';
    const again = parsePathData(subpathsToD(parsePathData(d)));
    expect(again).toEqual(parsePathData(d));
  });

  it('transformSubpaths moves anchors and handles', () => {
    const sp = transformSubpaths(parsePathData('M0 0 C1 1 2 2 3 3'), translate(10, 0));
    expect(sp[0].points[0].out).toEqual({ x: 11, y: 1 });
    expect(sp[0].points[1]).toMatchObject({ x: 13, y: 3, in: { x: 12, y: 2 } });
  });
});

describe('parseTransform', () => {
  it('composes lists left to right', () => {
    const m = parseTransform('translate(10,20) scale(2)');
    expect(m).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 });
  });
  it('rotate about a center', () => {
    const m = parseTransform('rotate(90 10 10)');
    // (20,10) → (10,20)
    close(m.a * 20 + m.c * 10 + m.e, 10);
    close(m.b * 20 + m.d * 10 + m.f, 20);
  });
  it('matrix and skew', () => {
    expect(parseTransform('matrix(1 0 0 1 5 6)')).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 });
    const s = parseTransform('skewX(45)');
    close(s.c, 1);
    expect(decompose(s)).toBeNull();
  });
  it('decomposes translate·rotate·scale', () => {
    const t = decompose(parseTransform('translate(5 5) rotate(30) scale(2 3)'))!;
    close(t.x, 5);
    close(t.rotation, 30);
    close(t.scaleX, 2);
    close(t.scaleY, 3);
  });
  it('ignores garbage', () => {
    expect(parseTransform('nonsense(1)')).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(parseTransform(null)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });
});
