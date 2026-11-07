import {
  applyWorldMatrix,
  findNode,
  parentWorldMatrix,
  rotationAbout,
  scaleAbout,
  selectionBounds,
  topmostIds,
  translation,
  worldBounds,
  type DesignDocument,
  type Id,
  type Matrix,
  type SceneNode,
  type Vec,
} from '@/model';
import { computeSnapTargets, snapPoint, snapRect, SNAP_PX, type SnapTarget, snapEnabled } from '@/canvas/snapping';
import { HANDLE_DIRS, type SelectionFrame } from '@/canvas/selectionFrame';
import type { ToolContext, ToolPointerEvent } from '../types';

interface Snapshot {
  nodes: { node: SceneNode; parent: Matrix }[];
}

function snapshot(doc: DesignDocument, ids: Id[]): Snapshot {
  return {
    nodes: topmostIds(doc, ids)
      .map((id) => ({ id, node: findNode(doc, id) }))
      .filter((x): x is { id: Id; node: SceneNode } => !!x.node && !x.node.locked)
      .map(({ id, node }) => ({ node, parent: parentWorldMatrix(doc, id) })),
  };
}

function applyMatrix(ctx: ToolContext, snap: Snapshot, m: Matrix) {
  ctx.docStore().replaceNodes(snap.nodes.map(({ node, parent }) => applyWorldMatrix(node, parent, m)));
}

/** Snap targets: artboard + every visible root-level node that isn't being transformed. */
export function snapTargetsExcluding(doc: DesignDocument, ids: Id[]): SnapTarget[] {
  const exclude = new Set(ids);
  const rects = doc.children
    .filter((n) => n.visible && !n.reference && !exclude.has(n.id))
    .map((n) => worldBounds(doc, n.id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  return computeSnapTargets(doc.artboard, rects);
}

export interface Gesture {
  move: (e: ToolPointerEvent) => void;
  end: () => void;
  cancel: () => void;
}

export function startMove(ctx: ToolContext, start: Vec, ids: Id[], label = 'Move'): Gesture {
  const store = ctx.docStore();
  // Alt-drag duplicates first inside the same transaction: one undo step.
  if (!store.txn) store.beginTransaction(label);
  const doc = ctx.doc();
  const snap = snapshot(doc, ids);
  const startBox = selectionBounds(doc, ids);
  const targets = snapTargetsExcluding(doc, ids);
  return {
    move: (e) => {
      let dx = e.point.x - start.x;
      let dy = e.point.y - start.y;
      if (e.shift) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const ed = ctx.editor();
      if (snapEnabled() && startBox && !e.mod) {
        const r = snapRect({ ...startBox, x: startBox.x + dx, y: startBox.y + dy }, targets, SNAP_PX * ctx.px());
        if (!e.shift || dx !== 0) dx += r.dx;
        if (!e.shift || dy !== 0) dy += r.dy;
        ed.setGuides(r.guides);
      }
      applyMatrix(ctx, snap, translation(dx, dy));
    },
    end: () => {
      ctx.editor().setGuides([]);
      ctx.docStore().commitTransaction();
    },
    cancel: () => {
      ctx.editor().setGuides([]);
      ctx.docStore().cancelTransaction();
    },
  };
}

const rot = (p: Vec, deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
};

export function startResize(ctx: ToolContext, handle: number, frame: SelectionFrame, ids: Id[]): Gesture {
  ctx.docStore().beginTransaction('Resize');
  const doc = ctx.doc();
  const snap = snapshot(doc, ids);
  const targets = snapTargetsExcluding(doc, ids);
  const dir = HANDLE_DIRS[handle];
  const { width: w0, height: h0, rotation, center } = frame;
  return {
    move: (e) => {
      const ed = ctx.editor();
      let point = e.point;
      if (snapEnabled() && rotation === 0 && !e.mod) {
        const s = snapPoint(point, targets, SNAP_PX * ctx.px());
        point = s.point;
        ed.setGuides(s.guides);
      }
      // Pointer in frame space (origin = frame center, axes = frame axes).
      const p = rot({ x: point.x - center.x, y: point.y - center.y }, -rotation);
      const anchor = e.alt ? { x: 0, y: 0 } : { x: (-dir.x * w0) / 2, y: (-dir.y * h0) / 2 };
      const origSpanX = e.alt ? w0 / 2 : w0;
      const origSpanY = e.alt ? h0 / 2 : h0;
      let kx = dir.x === 0 || origSpanX === 0 ? 1 : ((p.x - anchor.x) * dir.x) / origSpanX;
      let ky = dir.y === 0 || origSpanY === 0 ? 1 : ((p.y - anchor.y) * dir.y) / origSpanY;
      if (e.shift) {
        // Proportional: the dominant axis drives both.
        const k = dir.x === 0 ? ky : dir.y === 0 ? kx : Math.abs(kx) > Math.abs(ky) ? kx : ky;
        kx = k;
        ky = k;
      }
      // Avoid collapsing to zero (keeps the matrix invertible).
      const minK = 1e-3;
      if (Math.abs(kx) < minK) kx = kx < 0 ? -minK : minK;
      if (Math.abs(ky) < minK) ky = ky < 0 ? -minK : minK;
      const anchorWorld = rot(anchor, rotation);
      const m = scaleAbout(kx, ky, { x: center.x + anchorWorld.x, y: center.y + anchorWorld.y }, rotation);
      applyMatrix(ctx, snap, m);
    },
    end: () => {
      ctx.editor().setGuides([]);
      ctx.docStore().commitTransaction();
    },
    cancel: () => {
      ctx.editor().setGuides([]);
      ctx.docStore().cancelTransaction();
    },
  };
}

export function startRotate(ctx: ToolContext, start: Vec, frame: SelectionFrame, ids: Id[]): Gesture {
  ctx.docStore().beginTransaction('Rotate');
  const snap = snapshot(ctx.doc(), ids);
  const { center } = frame;
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  return {
    move: (e) => {
      const a = Math.atan2(e.point.y - center.y, e.point.x - center.x);
      let delta = ((a - a0) * 180) / Math.PI;
      if (e.shift) {
        // Snap the resulting frame angle to 15° steps.
        const target = Math.round((frame.rotation + delta) / 15) * 15;
        delta = target - frame.rotation;
      }
      applyMatrix(ctx, snap, rotationAbout(delta, center));
    },
    end: () => ctx.docStore().commitTransaction(),
    cancel: () => ctx.docStore().cancelTransaction(),
  };
}
