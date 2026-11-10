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
import { isProportional, resizeFactors } from '@/canvas/resizeMath';
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
      const { kx, ky, anchor } = resizeFactors({
        dir,
        pointer: p,
        width: w0,
        height: h0,
        fromCenter: e.alt,
        proportional: isProportional(ctx.editor().keepProportions, e.shift),
      });
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
