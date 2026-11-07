// Smart guides: snap a moving box (or point) to the artboard and other objects.
// Ported from the LogoGo archive (src/lib/snapping.ts) and generalised to rectangular artboards.
import type { Artboard, Rect, Vec } from '@/model';
import type { SnapGuide } from '@/store/useEditorStore';

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

/** Closest snap per axis for a box's left/center/right and top/middle/bottom within `tolerance`. */
export function snapRect(rect: Rect, targets: SnapTarget[], tolerance: number): SnapResult {
  const bx = best([rect.x + rect.width / 2, rect.x, rect.x + rect.width], targets, 'x', tolerance);
  const by = best([rect.y + rect.height / 2, rect.y, rect.y + rect.height], targets, 'y', tolerance);
  const guides: SnapGuide[] = [];
  if (bx) guides.push({ axis: 'x', position: bx.position });
  if (by) guides.push({ axis: 'y', position: by.position });
  return { dx: bx?.delta ?? 0, dy: by?.delta ?? 0, guides };
}

/** Snaps a single point (drawing, resize handles). */
export function snapPoint(p: Vec, targets: SnapTarget[], tolerance: number): { point: Vec; guides: SnapGuide[] } {
  const r = snapRect({ x: p.x, y: p.y, width: 0, height: 0 }, targets, tolerance);
  return { point: { x: p.x + r.dx, y: p.y + r.dy }, guides: r.guides };
}
