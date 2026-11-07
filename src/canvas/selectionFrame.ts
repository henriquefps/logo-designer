import { apply, localBounds, locate, rectCorners, selectionBounds, worldMatrix, type DesignDocument, type Id, type Vec } from '@/model';

/** The box the selection handles are drawn on: oriented for a single node, axis-aligned otherwise. */
export interface SelectionFrame {
  /** World corners: top-left, top-right, bottom-right, bottom-left (in the frame's own orientation). */
  corners: [Vec, Vec, Vec, Vec];
  /** Frame rotation in degrees. */
  rotation: number;
  center: Vec;
  /** Size in world units along the frame axes. */
  width: number;
  height: number;
}

const rot = (p: Vec, deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export function frameFromWorldCorners(points: Vec[], rotation: number): SelectionFrame {
  const local = points.map((p) => rot(p, -rotation));
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ].map((p) => rot(p, rotation)) as SelectionFrame['corners'];
  return {
    corners,
    rotation,
    center: rot({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, rotation),
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function getSelectionFrame(doc: DesignDocument, ids: Id[]): SelectionFrame | null {
  if (ids.length === 1) {
    const loc = locate(doc, ids[0]);
    if (!loc) return null;
    const lb = localBounds(loc.node);
    if (!lb) return null;
    const m = worldMatrix(doc, ids[0]);
    const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    return frameFromWorldCorners(rectCorners(lb).map((p) => apply(m, p)), rotation);
  }
  const b = selectionBounds(doc, ids);
  return b ? frameFromWorldCorners(rectCorners(b), 0) : null;
}

/** Handle order: tl, t, tr, r, br, b, bl, l. Each has a unit direction in frame space. */
export const HANDLE_DIRS: Vec[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
];

/** World position of handle i (direction-based, so it works for any frame). */
export function handlePosition(frame: SelectionFrame, i: number): Vec {
  const d = HANDLE_DIRS[i];
  const off = rot({ x: (d.x * frame.width) / 2, y: (d.y * frame.height) / 2 }, frame.rotation);
  return { x: frame.center.x + off.x, y: frame.center.y + off.y };
}

/** Rotation handle sits `distPx` screen pixels above the top edge's middle. */
export function rotationHandlePosition(frame: SelectionFrame, zoom: number, distPx = 24): Vec {
  const top = handlePosition(frame, 1);
  const up = rot({ x: 0, y: -distPx / zoom }, frame.rotation);
  return { x: top.x + up.x, y: top.y + up.y };
}

/** CSS resize cursor for handle i given the frame rotation. */
export function handleCursor(i: number, rotation: number): string {
  const cursors = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
  // Angle of the handle direction (t = 0°), snapped to 45° buckets.
  const base = [315, 0, 45, 90, 135, 180, 225, 270][i];
  const a = (((base + rotation) % 180) + 180) % 180;
  return cursors[Math.round(a / 45) % 4];
}
