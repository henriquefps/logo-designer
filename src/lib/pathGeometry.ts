import type { LogoElement } from '@/types/element';

/**
 * Anchors/handles on a shape's `points` are stored in the element's own local space — before
 * flip and rotation are applied (matching how ElementNode renders: `rotate(rotation)` on the
 * outer <g>, then `scale(flipH?-1:1, flipV?-1:1)` on the inner one). Anything that needs to draw
 * or drag a point in absolute canvas coordinates (node-edit handles, future boolean ops) has to
 * go through the same transform — these two functions are that shared, tested-once conversion.
 */

/** Local-space point -> absolute canvas-space point, for drawing a handle where it visually sits. */
export function localToCanvasPoint(element: Pick<LogoElement, 'x' | 'y' | 'rotation' | 'flipH' | 'flipV'>, local: { x: number; y: number }): { x: number; y: number } {
  const fx = element.flipH ? -local.x : local.x;
  const fy = element.flipV ? -local.y : local.y;
  const rad = (element.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: element.x + (fx * cos - fy * sin),
    y: element.y + (fx * sin + fy * cos),
  };
}

/** Absolute canvas-space delta (e.g. from a pointer drag) -> the local-space delta that produces
 * the same visual movement, i.e. the inverse of `localToCanvasPoint`'s transform. */
export function canvasDeltaToLocalDelta(element: Pick<LogoElement, 'rotation' | 'flipH' | 'flipV'>, dx: number, dy: number): { x: number; y: number } {
  const rad = (-element.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return {
    x: element.flipH ? -rx : rx,
    y: element.flipV ? -ry : ry,
  };
}
