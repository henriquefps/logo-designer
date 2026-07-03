import { CANVAS_SIZE } from '@/types/canvas';

export type AlignAxisMode = 'start' | 'center' | 'end';

export interface AlignTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Aligns elements along one axis. With a single selected element the
 * reference frame is the canvas bounds; with 2+ it's the combined bounding
 * box of the selection itself (standard "align selection" behavior).
 */
export function alignAxis(targets: AlignTarget[], axis: 'x' | 'y', mode: AlignAxisMode): { id: string; x: number; y: number }[] {
  const useCanvasFrame = targets.length <= 1;
  let refStart: number;
  let refEnd: number;

  if (useCanvasFrame) {
    refStart = 0;
    refEnd = CANVAS_SIZE;
  } else if (axis === 'x') {
    refStart = Math.min(...targets.map((t) => t.x - t.width / 2));
    refEnd = Math.max(...targets.map((t) => t.x + t.width / 2));
  } else {
    refStart = Math.min(...targets.map((t) => t.y - t.height / 2));
    refEnd = Math.max(...targets.map((t) => t.y + t.height / 2));
  }
  const refCenter = (refStart + refEnd) / 2;

  return targets.map((t) => {
    const half = (axis === 'x' ? t.width : t.height) / 2;
    const pos = mode === 'start' ? refStart + half : mode === 'end' ? refEnd - half : refCenter;
    return axis === 'x' ? { id: t.id, x: pos, y: t.y } : { id: t.id, x: t.x, y: pos };
  });
}

/** Combines an x-mode and y-mode alignment into a single position update per element. */
export function alignBoth(targets: AlignTarget[], xMode: AlignAxisMode, yMode: AlignAxisMode): { id: string; x: number; y: number }[] {
  const xResult = alignAxis(targets, 'x', xMode);
  const yResult = alignAxis(targets, 'y', yMode);
  const yById = new Map(yResult.map((r) => [r.id, r.y]));
  return xResult.map((r) => ({ id: r.id, x: r.x, y: yById.get(r.id) ?? r.y }));
}
