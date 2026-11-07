// Freehand helpers shared by the pencil and brush tools (pure).
import { getStroke } from 'perfect-freehand';
import type { Vec } from '@/model';
import { dist } from './geometry';

/** Drops points closer than `minDist` to the previous kept point (keeps the last point). */
export function decimate(points: Vec[], minDist: number): Vec[] {
  if (points.length < 3) return [...points];
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (dist(points[i], out[out.length - 1]) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Should a freehand stroke close? (released within `tolerance` of its start, and long enough to be a loop). */
export function shouldClose(points: Vec[], tolerance: number): boolean {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (dist(first, last) > tolerance) return false;
  // The stroke must travel away from the start first (not a short jiggle).
  return points.some((p) => dist(p, first) > tolerance * 3);
}

/** Pencil smoothness 0..100 → simplify tolerance in screen pixels. */
export const smoothnessToTolerance = (smoothness: number) => 0.5 + (Math.max(0, Math.min(100, smoothness)) / 100) * 9.5;

export interface BrushOptions {
  size: number;
  /** -1..1: how much speed thins the stroke. */
  thinning: number;
}

/** Variable-width outline polygon for a brush stroke (perfect-freehand). */
export function brushOutline(points: Vec[], opts: BrushOptions, last = true): Vec[] {
  const out = getStroke(
    points.map((p) => [p.x, p.y]),
    { size: opts.size, thinning: opts.thinning, smoothing: 0.5, streamline: 0.5, simulatePressure: true, last },
  );
  return out.map(([x, y]) => ({ x, y }));
}
