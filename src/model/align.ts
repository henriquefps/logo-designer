import { selectionBounds, worldBounds } from './bounds';
import { topmostIds } from './tree';
import type { DesignDocument, Id, Rect, Vec } from './types';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeMode = 'horizontal' | 'vertical';

/**
 * World-space translation per node to align their boxes to the selection box (or the artboard
 * when `toArtboard` is set or only one node is given).
 */
export function alignDeltas(doc: DesignDocument, ids: Id[], mode: AlignMode, toArtboard = false): Map<Id, Vec> {
  const nodes = topmostIds(doc, ids);
  const out = new Map<Id, Vec>();
  const target: Rect | null =
    toArtboard || nodes.length < 2 ? { x: 0, y: 0, width: doc.artboard.width, height: doc.artboard.height } : selectionBounds(doc, nodes);
  if (!target) return out;
  for (const id of nodes) {
    const b = worldBounds(doc, id);
    if (!b) continue;
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = target.x - b.x;
    if (mode === 'hcenter') dx = target.x + target.width / 2 - (b.x + b.width / 2);
    if (mode === 'right') dx = target.x + target.width - (b.x + b.width);
    if (mode === 'top') dy = target.y - b.y;
    if (mode === 'vcenter') dy = target.y + target.height / 2 - (b.y + b.height / 2);
    if (mode === 'bottom') dy = target.y + target.height - (b.y + b.height);
    if (dx || dy) out.set(id, { x: dx, y: dy });
  }
  return out;
}

/** Equal gaps between boxes (needs 3+ nodes; with `toArtboard`, spreads across the artboard with 2+). */
export function distributeDeltas(doc: DesignDocument, ids: Id[], mode: DistributeMode, toArtboard = false): Map<Id, Vec> {
  const out = new Map<Id, Vec>();
  const items = topmostIds(doc, ids)
    .map((id) => ({ id, b: worldBounds(doc, id)! }))
    .filter((x) => x.b);
  if (items.length < (toArtboard ? 2 : 3)) return out;
  const h = mode === 'horizontal';
  const pos = (r: Rect) => (h ? r.x : r.y);
  const size = (r: Rect) => (h ? r.width : r.height);
  items.sort((a, b) => pos(a.b) - pos(b.b));
  const start = toArtboard ? 0 : pos(items[0].b);
  const end = toArtboard ? (h ? doc.artboard.width : doc.artboard.height) : pos(items.at(-1)!.b) + size(items.at(-1)!.b);
  const total = items.reduce((s, x) => s + size(x.b), 0);
  const gap = (end - start - total) / (items.length - 1);
  let cursor = start;
  for (const { id, b } of items) {
    const d = cursor - pos(b);
    if (Math.abs(d) > 1e-9) out.set(id, h ? { x: d, y: 0 } : { x: 0, y: d });
    cursor += size(b) + gap;
  }
  return out;
}
