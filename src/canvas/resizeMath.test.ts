import { describe, expect, it } from 'vitest';
import { apply, rectCorners, rotationAbout, scaleAbout, type Vec } from '@/model';
import { HANDLE_DIRS } from './selectionFrame';
import { isProportional, resizeFactors } from './resizeMath';

const W = 100;
const H = 50;
const base = { width: W, height: H, fromCenter: false };
const BR = HANDLE_DIRS[4];
const R = HANDLE_DIRS[3];
const T = HANDLE_DIRS[1];

describe('isProportional', () => {
  it('is toggle XOR shift', () => {
    expect(isProportional(false, false)).toBe(false);
    expect(isProportional(true, false)).toBe(true);
    expect(isProportional(false, true)).toBe(true);
    expect(isProportional(true, true)).toBe(false);
  });
});

describe('resizeFactors', () => {
  const drag = { x: 100, y: 30 }; // bottom-right dragged to (100, 30): kx 1, ky 0.8 from anchor (-50,-25)
  it('corner, free: axes are independent', () => {
    const r = resizeFactors({ ...base, dir: BR, pointer: { x: 150, y: 25 }, proportional: false });
    expect(r.kx).toBeCloseTo(2);
    expect(r.ky).toBeCloseTo(1);
    expect(r.anchor).toEqual({ x: -50, y: -25 });
  });
  it('corner, proportional: dominant axis drives both', () => {
    const r = resizeFactors({ ...base, dir: BR, pointer: { x: 150, y: 25 }, proportional: true });
    expect(r.kx).toBeCloseTo(2);
    expect(r.ky).toBeCloseTo(2);
    const r2 = resizeFactors({ ...base, dir: BR, pointer: drag, proportional: true });
    expect(r2.kx).toBeCloseTo(r2.ky);
  });
  it('side handle, free: other axis untouched', () => {
    const r = resizeFactors({ ...base, dir: R, pointer: { x: 150, y: 10 }, proportional: false });
    expect(r.kx).toBeCloseTo(2);
    expect(r.ky).toBe(1);
  });
  it('side handle, proportional: other axis follows around the opposite edge centre', () => {
    const r = resizeFactors({ ...base, dir: R, pointer: { x: 150, y: 10 }, proportional: true });
    expect(r.kx).toBeCloseTo(2);
    expect(r.ky).toBeCloseTo(2);
    expect(r.anchor.x).toBe(-50);
    expect(r.anchor.y).toBeCloseTo(0);
    const t = resizeFactors({ ...base, dir: T, pointer: { x: 3, y: -125 }, proportional: true });
    expect(t.ky).toBeCloseTo(3);
    expect(t.kx).toBeCloseTo(3);
    expect(t.anchor.x).toBeCloseTo(0);
    expect(t.anchor.y).toBe(25);
  });
  it('alt resizes from the centre', () => {
    const r = resizeFactors({ ...base, dir: BR, pointer: { x: 100, y: 50 }, fromCenter: true, proportional: true });
    expect(r.anchor.x).toBeCloseTo(0);
    expect(r.anchor.y).toBeCloseTo(0);
    expect(r.kx).toBeCloseTo(2);
    expect(r.ky).toBeCloseTo(2);
  });
  it('never collapses to zero', () => {
    const r = resizeFactors({ ...base, dir: BR, pointer: { x: -50, y: -25 }, proportional: false });
    expect(Math.abs(r.kx)).toBeGreaterThan(0);
  });
  it('rotated object keeps its aspect ratio in world space', () => {
    const rotation = 30;
    const rot = (p: Vec, d: number): Vec => {
      const a = (d * Math.PI) / 180;
      return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
    };
    const worldPointer = rot({ x: 140, y: 31 }, rotation); // frame space → world (centre at origin)
    const p = rot(worldPointer, -rotation);
    const { kx, ky, anchor } = resizeFactors({ ...base, dir: BR, pointer: p, proportional: true });
    const aw = rot(anchor, rotation);
    const m = scaleAbout(kx, ky, aw, rotation);
    // The object: a 100x50 box rotated by 30° about the origin.
    const corners = rectCorners({ x: -50, y: -25, width: W, height: H }).map((c) => apply(rotationAbout(rotation, { x: 0, y: 0 }), c));
    const out = corners.map((c) => apply(m, c));
    const len = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(len(out[0], out[1]) / len(out[1], out[2])).toBeCloseTo(W / H);
    expect(kx).toBeGreaterThan(1);
  });
});
