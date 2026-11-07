// Smart guides: snap a moving box (or point) to the artboard and other objects.
// Ported from the LogoGo archive (src/lib/snapping.ts) and generalised to rectangular artboards.
import type { Artboard, Rect, Vec } from '@/model';
import { useEditorStore, type SnapGuide } from '@/store/useEditorStore';

/** Is any snapping on (smart guides or snap to grid)? Tools check this before snapping. */
export const snapEnabled = () => {
  const e = useEditorStore.getState();
  return e.snapping || e.snapToGrid;
};

/** Grid spacing when snap to grid is on, else null. */
function gridStep(): number | null {
  const e = useEditorStore.getState();
  return e.snapToGrid && e.gridSize > 0 ? e.gridSize : null;
}

/** Smallest move that puts one of the candidates on a grid line. */
function gridDelta(candidates: number[], step: number): number {
  let best = Infinity;
  for (const c of candidates) {
    const d = Math.round(c / step) * step - c;
    if (Math.abs(d) < Math.abs(best)) best = d;
  }
  return Number.isFinite(best) ? best : 0;
}

export interface SnapTarget {
  axis: 'x' | 'y';
  position: number;
  source: 'artboard-center' | 'artboard-edge' | 'object-center' | 'object-edge';
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** Snap distance in screen pixels; divide by zoom for world units. */
export const SNAP_PX = 6;

export function computeSnapTargets(artboard: Pick<Artboard, 'width' | 'height'>, others: Rect[]): SnapTarget[] {
  const { width: w, height: h } = artboard;
  const targets: SnapTarget[] = [
    { axis: 'x', position: w / 2, source: 'artboard-center' },
    { axis: 'y', position: h / 2, source: 'artboard-center' },
    { axis: 'x', position: 0, source: 'artboard-edge' },
    { axis: 'x', position: w, source: 'artboard-edge' },
    { axis: 'y', position: 0, source: 'artboard-edge' },
    { axis: 'y', position: h, source: 'artboard-edge' },
  ];
  for (const r of others) {
    targets.push(
      { axis: 'x', position: r.x + r.width / 2, source: 'object-center' },
      { axis: 'x', position: r.x, source: 'object-edge' },
      { axis: 'x', position: r.x + r.width, source: 'object-edge' },
      { axis: 'y', position: r.y + r.height / 2, source: 'object-center' },
      { axis: 'y', position: r.y, source: 'object-edge' },
      { axis: 'y', position: r.y + r.height, source: 'object-edge' },
    );
  }
  return targets;
}

function best(candidates: number[], targets: SnapTarget[], axis: 'x' | 'y', tolerance: number) {
  let found: { diff: number; delta: number; position: number } | null = null;
  for (const t of targets) {
    if (t.axis !== axis) continue;
    for (const c of candidates) {
      const diff = Math.abs(t.position - c);
      if (diff <= tolerance && (!found || diff < found.diff)) found = { diff, delta: t.position - c, position: t.position };
    }
  }
  return found;
}

/**
 * Closest snap per axis for a box's left/center/right and top/middle/bottom within `tolerance`
 * (smart guides, when on). With snap to grid on, an axis without a guide snaps its nearest edge
 * to the grid.
 */
export function snapRect(rect: Rect, targets: SnapTarget[], tolerance: number): SnapResult {
  const smart = useEditorStore.getState().snapping;
  const bx = smart ? best([rect.x + rect.width / 2, rect.x, rect.x + rect.width], targets, 'x', tolerance) : null;
  const by = smart ? best([rect.y + rect.height / 2, rect.y, rect.y + rect.height], targets, 'y', tolerance) : null;
  const guides: SnapGuide[] = [];
  if (bx) guides.push({ axis: 'x', position: bx.position });
  if (by) guides.push({ axis: 'y', position: by.position });
  const step = gridStep();
  const dx = bx ? bx.delta : step ? gridDelta([rect.x, rect.x + rect.width], step) : 0;
  const dy = by ? by.delta : step ? gridDelta([rect.y, rect.y + rect.height], step) : 0;
  return { dx, dy, guides };
}

/** Snaps a single point (drawing, resize handles). */
export function snapPoint(p: Vec, targets: SnapTarget[], tolerance: number): { point: Vec; guides: SnapGuide[] } {
  const r = snapRect({ x: p.x, y: p.y, width: 0, height: 0 }, targets, tolerance);
  return { point: { x: p.x + r.dx, y: p.y + r.dy }, guides: r.guides };
}
