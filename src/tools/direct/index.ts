import { NavigationArrowIcon } from '@phosphor-icons/react';
import { apply, applyLinear, findNode, invert, rectContains, rectFromCorners, worldMatrix, type Id, type PathNode, type Vec } from '@/model';
import { enterNodeEdit } from '@/vector/commands';
import { hasOutline } from '@/vector/convert';
import { constrain45, dist, nearestSegment } from '@/vector/geometry';
import { anchorKey, deletePoints, insertPoint, moveAnchors, moveHandle, toggleSmooth, type AnchorRef } from '@/vector/pathEdit';
import type { Tool, ToolContext } from '../types';
import { DirectOverlay } from './DirectOverlay';
import { visibleHandles } from './handles';
import { useNodeEdit } from './state';

const HIT_PX = 7;
const SEGMENT_PX = 5;
const DRAG_PX = 3;

type Gesture =
  | { kind: 'anchors'; base: PathNode; keys: string[]; start: Vec; screen: Vec; moved: boolean }
  | { kind: 'handle'; base: PathNode; ref: AnchorRef; which: 'in' | 'out'; alt: boolean }
  | { kind: 'marquee'; start: Vec; additive: boolean; base: string[] };

let gesture: Gesture | null = null;

const ed = (ctx: ToolContext) => ctx.editor();
const sel = () => useNodeEdit.getState().selected;
const setSel = (keys: string[]) => useNodeEdit.getState().setSelected(keys);

function editingPath(ctx: ToolContext): PathNode | null {
  const id = ed(ctx).editingPathId;
  const n = id ? findNode(ctx.doc(), id) : null;
  return n?.type === 'path' && !n.locked ? n : null;
}

/** Hit test in screen-ish terms: returns the closest anchor/handle within HIT_PX. */
function hitAnchorOrHandle(ctx: ToolContext, path: PathNode, world: Vec) {
  const m = worldMatrix(ctx.doc(), path.id);
  const tol = HIT_PX * ctx.px();
  let best: { kind: 'handle'; ref: AnchorRef; which: 'in' | 'out'; d: number } | { kind: 'anchor'; ref: AnchorRef; d: number } | null = null;
  for (const h of visibleHandles(path.subpaths, sel())) {
    const p = path.subpaths[h.ref.s].points[h.ref.i][h.which]!;
    const d = dist(apply(m, p), world);
    if (d <= tol && (!best || d < best.d)) best = { kind: 'handle', ref: h.ref, which: h.which, d };
  }
  if (best) return best;
  path.subpaths.forEach((sp, s) =>
    sp.points.forEach((p, i) => {
      const d = dist(apply(m, p), world);
      if (d <= tol && (!best || d < best.d)) best = { kind: 'anchor', ref: { s, i }, d };
    }),
  );
  return best;
}

/** Starts editing `id` (shapes ask to convert first). */
function startEditing(ctx: ToolContext, id: Id) {
  const n = findNode(ctx.doc(), id);
  if (!n || !hasOutline(n)) return false;
  if (n.type === 'path') {
    ed(ctx).setSelection([id]);
    ed(ctx).setEditingPath(id);
    setSel([]);
    return true;
  }
  return enterNodeEdit(id);
}

function exitToSelect(ctx: ToolContext) {
  const id = ed(ctx).editingPathId;
  ctx.setTool('select');
  if (id && findNode(ctx.doc(), id)) ed(ctx).setSelection([id]);
}

function localDelta(ctx: ToolContext, path: PathNode, worldDelta: Vec): Vec {
  return applyLinear(invert(worldMatrix(ctx.doc(), path.id)), worldDelta);
}

const direct: Tool = {
  id: 'direct',
  label: 'Direct select',
  shortcut: 'a',
  icon: NavigationArrowIcon,
  cursor: 'default',
  group: 'select',
  order: 1,
  hint: 'Drag anchors and handles. Click a segment to add a point, double-click an anchor for corner/smooth, Delete removes points. Enter or Esc to finish.',
  Overlay: DirectOverlay,

  onActivate(ctx) {
    const e = ed(ctx);
    if (e.editingPathId) return;
    if (e.selection.length === 1) {
      const n = findNode(ctx.doc(), e.selection[0]);
      if (n && hasOutline(n)) startEditing(ctx, n.id);
    }
  },

  onDeactivate(ctx) {
    gesture = null;
    ed(ctx).setEditingPath(null);
    ed(ctx).setMarquee(null);
    setSel([]);
  },

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    const path = editingPath(ctx);
    if (path) {
      const hit = hitAnchorOrHandle(ctx, path, e.point);
      if (hit?.kind === 'handle') {
        ctx.docStore().beginTransaction('Move handle');
        gesture = { kind: 'handle', base: path, ref: hit.ref, which: hit.which, alt: e.alt };
        return;
      }
      if (hit?.kind === 'anchor') {
        const key = anchorKey(hit.ref);
        if (e.detail === 2) {
          ctx.docStore().replaceNodes([{ ...path, subpaths: toggleSmooth(path.subpaths, hit.ref) }], { label: 'Toggle smooth point' });
          setSel([key]);
          return;
        }
        if (e.shift) {
          const cur = sel();
          setSel(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
          if (!sel().includes(key)) return;
        } else if (!sel().includes(key)) setSel([key]);
        gesture = { kind: 'anchors', base: path, keys: sel(), start: e.point, screen: e.screen, moved: false };
        return;
      }
      // Click on a segment adds a point there (exact Bézier split) and lets you drag it.
      const inv = invert(worldMatrix(ctx.doc(), path.id));
      const local = apply(inv, e.point);
      const scale = Math.max(Math.hypot(inv.a, inv.b), Math.hypot(inv.c, inv.d));
      const seg = nearestSegment(path.subpaths, local, SEGMENT_PX * ctx.px() * scale);
      if (seg) {
        const store = ctx.docStore();
        store.beginTransaction('Add anchor point');
        const { subpaths, ref } = insertPoint(path.subpaths, seg.subpath, seg.segment, seg.t);
        const next = { ...path, subpaths };
        store.replaceNodes([next]);
        setSel([anchorKey(ref)]);
        gesture = { kind: 'anchors', base: next, keys: [anchorKey(ref)], start: e.point, screen: e.screen, moved: false };
        return;
      }
    }
    // Another path/shape under the pointer: edit it instead.
    const other = ctx.hitTest(e.point, { deep: true });
    if (other && other !== path?.id) {
      const n = findNode(ctx.doc(), other);
      if (n && hasOutline(n)) {
        startEditing(ctx, other);
        return;
      }
    }
    if (path) {
      if (e.detail === 2 && !e.shift) {
        exitToSelect(ctx);
        return;
      }
      gesture = { kind: 'marquee', start: e.point, additive: e.shift, base: e.shift ? sel() : [] };
      if (!e.shift) setSel([]);
      return;
    }
    ed(ctx).clearSelection();
  },

  onPointerMove(e, ctx) {
    if (!e.pressed) {
      const path = editingPath(ctx);
      const hit = path ? hitAnchorOrHandle(ctx, path, e.point) : null;
      ed(ctx).setCursor(hit ? 'pointer' : 'default');
      ed(ctx).setHover(hit || path ? null : ctx.hitTest(e.point, { deep: true }));
      return;
    }
    if (!gesture) return;
    const store = ctx.docStore();
    if (gesture.kind === 'anchors') {
      if (!gesture.moved) {
        if (dist(e.screen, gesture.screen) < DRAG_PX) return;
        gesture.moved = true;
        if (!store.txn) store.beginTransaction('Move points');
      }
      let target = e.point;
      if (e.shift) target = constrain45(gesture.start, target);
      const d = localDelta(ctx, gesture.base, { x: target.x - gesture.start.x, y: target.y - gesture.start.y });
      store.replaceNodes([{ ...gesture.base, subpaths: moveAnchors(gesture.base.subpaths, gesture.keys, d) }]);
      return;
    }
    if (gesture.kind === 'handle') {
      const local = apply(invert(worldMatrix(ctx.doc(), gesture.base.id)), e.point);
      const subpaths = moveHandle(gesture.base.subpaths, gesture.ref, gesture.which, local, {
        breakSymmetry: gesture.alt || e.alt,
        constrain: e.shift,
      });
      store.replaceNodes([{ ...gesture.base, subpaths }]);
      return;
    }
    // Marquee over anchors.
    const r = rectFromCorners(gesture.start, e.point);
    ed(ctx).setMarquee(r);
    const path = editingPath(ctx);
    if (!path) return;
    const m = worldMatrix(ctx.doc(), path.id);
    const hits: string[] = [];
    path.subpaths.forEach((sp, s) => sp.points.forEach((p, i) => rectContains(r, apply(m, p)) && hits.push(anchorKey({ s, i }))));
    setSel(gesture.additive ? [...gesture.base, ...hits] : hits);
  },

  onPointerUp(_e, ctx) {
    if (ctx.docStore().txn) ctx.docStore().commitTransaction();
    gesture = null;
    ed(ctx).setMarquee(null);
  },

  onCancel(ctx) {
    if (ctx.docStore().txn) ctx.docStore().cancelTransaction();
    gesture = null;
    ed(ctx).setMarquee(null);
  },

  onKeyDown(e, ctx) {
    const path = editingPath(ctx);
    if (e.key === 'Escape' || e.key === 'Enter') {
      if (gesture) {
        direct.onCancel!(ctx);
        return true;
      }
      if (path || ed(ctx).editingPathId) {
        exitToSelect(ctx);
        return true;
      }
      return false;
    }
    if (!path || !sel().length || e.metaKey || e.ctrlKey) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const subpaths = deletePoints(path.subpaths, sel());
      setSel([]);
      if (!subpaths.length) {
        ctx.docStore().deleteNodes([path.id]);
        exitToSelect(ctx);
      } else ctx.docStore().replaceNodes([{ ...path, subpaths }], { label: 'Delete points' });
      return true;
    }
    const arrows: Record<string, Vec> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const a = arrows[e.key];
    if (a) {
      const k = e.shiftKey ? 10 : 1;
      const d = localDelta(ctx, path, { x: a.x * k, y: a.y * k });
      ctx.docStore().replaceNodes([{ ...path, subpaths: moveAnchors(path.subpaths, sel(), d) }], { label: 'Nudge points' });
      return true;
    }
    return false;
  },
};

export default direct;
