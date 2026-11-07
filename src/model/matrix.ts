import type { Transform, Vec } from './types';

/** 2D affine matrix [a c e; b d f; 0 0 1], same layout as SVG/DOMMatrix. */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const RAD = Math.PI / 180;

/** m1 · m2 (apply m2 first, then m1). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return { ...IDENTITY };
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export const apply = (m: Matrix, p: Vec): Vec => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
/** Applies only the linear part (for deltas/directions). */
export const applyLinear = (m: Matrix, p: Vec): Vec => ({ x: m.a * p.x + m.c * p.y, y: m.b * p.x + m.d * p.y });

export const translate = (x: number, y: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
export const scale = (sx: number, sy = sx): Matrix => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
export function rotate(deg: number): Matrix {
  const r = deg * RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function rotateAround(deg: number, center: Vec): Matrix {
  return multiply(translate(center.x, center.y), multiply(rotate(deg), translate(-center.x, -center.y)));
}

/** Matrix of a node transform: translate · rotate · scale. */
export function fromTransform(t: Transform): Matrix {
  return multiply(translate(t.x, t.y), multiply(rotate(t.rotation), scale(t.scaleX, t.scaleY)));
}

/** translate · rotate only (the node's "frame", without scale). */
export function frameOf(t: Transform): Matrix {
  return multiply(translate(t.x, t.y), rotate(t.rotation));
}

/** Decomposes into translate · rotate · scale (skew is dropped). */
export function toTransform(m: Matrix): Transform {
  const scaleX = Math.hypot(m.a, m.b);
  const det = m.a * m.d - m.b * m.c;
  const rotation = Math.atan2(m.b, m.a) / RAD;
  const scaleY = scaleX === 0 ? Math.hypot(m.c, m.d) : det / scaleX;
  return { x: m.e, y: m.f, rotation: normalizeAngle(rotation), scaleX, scaleY };
}

/** Normalizes degrees into (-180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return Math.abs(a) < 1e-9 ? 0 : a;
}

export function toSvgTransform(t: Transform): string | undefined {
  const parts: string[] = [];
  if (t.x !== 0 || t.y !== 0) parts.push(`translate(${round(t.x)} ${round(t.y)})`);
  if (t.rotation !== 0) parts.push(`rotate(${round(t.rotation)})`);
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${round(t.scaleX)} ${round(t.scaleY)})`);
  return parts.length ? parts.join(' ') : undefined;
}

export const matrixToSvg = (m: Matrix) =>
  `matrix(${round(m.a)} ${round(m.b)} ${round(m.c)} ${round(m.d)} ${round(m.e)} ${round(m.f)})`;

export const round = (n: number, digits = 3) => {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};
