import type { Vec } from '@/model';

export interface ResizeInput {
  /** Handle direction in frame space (-1/0/1 per axis). */
  dir: Vec;
  /** Pointer in frame space (origin = frame centre, axes = frame axes). */
  pointer: Vec;
  width: number;
  height: number;
  /** Resize from the centre (Alt/Option). */
  fromCenter: boolean;
  /** Scale both axes by the same factor. */
  proportional: boolean;
}

export interface ResizeResult {
  kx: number;
  ky: number;
  /** Fixed point in frame space (centre, or the opposite edge/corner). */
  anchor: Vec;
}

/** Proportional when the "keep proportions" toggle is on, inverted by Shift. */
export const isProportional = (keepProportions: boolean, shift: boolean): boolean => keepProportions !== shift;

/**
 * Scale factors for dragging a selection handle. Corner handles: the dominant axis drives both when
 * proportional. Side handles: the other axis follows, scaled about the opposite edge's centre.
 */
export function resizeFactors({ dir, pointer, width, height, fromCenter, proportional }: ResizeInput): ResizeResult {
  const anchor = fromCenter ? { x: 0, y: 0 } : { x: (-dir.x * width) / 2, y: (-dir.y * height) / 2 };
  const spanX = fromCenter ? width / 2 : width;
  const spanY = fromCenter ? height / 2 : height;
  let kx = dir.x === 0 || spanX === 0 ? 1 : ((pointer.x - anchor.x) * dir.x) / spanX;
  let ky = dir.y === 0 || spanY === 0 ? 1 : ((pointer.y - anchor.y) * dir.y) / spanY;
  if (proportional) {
    const k = dir.x === 0 ? ky : dir.y === 0 ? kx : Math.abs(kx) > Math.abs(ky) ? kx : ky;
    kx = k;
    ky = k;
  }
  // Avoid collapsing to zero (keeps the matrix invertible).
  const minK = 1e-3;
  if (Math.abs(kx) < minK) kx = kx < 0 ? -minK : minK;
  if (Math.abs(ky) < minK) ky = ky < 0 ? -minK : minK;
  return { kx, ky, anchor };
}
