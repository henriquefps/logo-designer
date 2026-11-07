import { CursorIcon } from '@phosphor-icons/react';
import { rectFromCorners, nodesInRect, type Vec } from '@/model';
import { getSelectionFrame, handleCursor, handlePosition, rotationHandlePosition, type SelectionFrame } from '@/canvas/selectionFrame';
import type { Tool, ToolContext, ToolPointerEvent } from '../types';
import { startMove, startResize, startRotate, type Gesture } from './gestures';
import { SelectOptions } from './SelectOptions';
import { editPathAt, editSelectedPath } from '@/vector/commands';

const HANDLE_HIT_PX = 8;
const DRAG_THRESHOLD_PX = 3;

type Pending =
  | { kind: 'move'; start: Vec; screen: Vec; alt: boolean }
  | { kind: 'marquee'; start: Vec; additive: boolean; base: string[] }
  | null;

let gesture: Gesture | null = null;
let pending: Pending = null;

type HandleHit = { kind: 'resize'; index: number; frame: SelectionFrame } | { kind: 'rotate'; frame: SelectionFrame } | null;

function hitHandle(ctx: ToolContext, e: ToolPointerEvent): HandleHit {
  const ed = ctx.editor();
  const ids = ed.selection;
  if (!ids.length) return null;
  const frame = getSelectionFrame(ctx.doc(), ids);
  if (!frame) return null;
  const tol = HANDLE_HIT_PX * ctx.px();
  const near = (p: Vec) => Math.hypot(p.x - e.point.x, p.y - e.point.y) <= tol;
  if (near(rotationHandlePosition(frame, ed.zoom))) return { kind: 'rotate', frame };
  const tiny = frame.width / ctx.px() < 16 || frame.height / ctx.px() < 16;
  for (let i = 0; i < 8; i++) {
    if (tiny && i % 2 === 1) continue; // only corners on tiny boxes
    if (near(handlePosition(frame, i))) return { kind: 'resize', index: i, frame };
  }
  return null;
}

const select: Tool = {
  id: 'select',
  label: 'Select',
  shortcut: 'v',
  icon: CursorIcon,
  cursor: 'default',
  group: 'select',
  order: 0,
  Options: SelectOptions,

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    const ed = ctx.editor();
    const handle = hitHandle(ctx, e);
    if (handle) {
      gesture =
        handle.kind === 'rotate'
          ? startRotate(ctx, e.point, handle.frame, ed.selection)
          : startResize(ctx, handle.index, handle.frame, ed.selection);
      return;
    }
    if (e.detail === 2 && !e.shift && editPathAt(ctx.hitTest(e.point, { deep: true }))) return;
    const hit = ctx.hitTest(e.point, { deep: e.mod });
    if (hit) {
      if (e.shift) {
        ed.toggleSelection(hit);
        if (!ctx.editor().selection.includes(hit)) return;
      } else if (!ed.selection.includes(hit)) {
        ed.setSelection([hit]);
      }
      pending = { kind: 'move', start: e.point, screen: e.screen, alt: e.alt };
      return;
    }
    if (!e.shift) ed.clearSelection();
    pending = { kind: 'marquee', start: e.point, additive: e.shift, base: e.shift ? ed.selection : [] };
  },

  onPointerMove(e, ctx) {
    const ed = ctx.editor();
    if (!e.pressed) {
      // Hover: cursor over handles + hover outline.
      const handle = hitHandle(ctx, e);
      if (handle?.kind === 'resize') ed.setCursor(handleCursor(handle.index, handle.frame.rotation));
      else if (handle?.kind === 'rotate') ed.setCursor('grab');
      else ed.setCursor('default');
      ed.setHover(handle ? null : ctx.hitTest(e.point, { deep: e.mod }));
      return;
    }
    if (gesture) {
      gesture.move(e);
      return;
    }
    if (pending?.kind === 'move') {
      if (Math.hypot(e.screen.x - pending.screen.x, e.screen.y - pending.screen.y) < DRAG_THRESHOLD_PX) return;
      let ids = ed.selection;
      if (pending.alt) {
        // Alt-drag duplicates and moves the copies.
        ctx.docStore().beginTransaction('Duplicate');
        ids = ctx.docStore().duplicate(ids, 0);
        ed.setSelection(ids);
      }
      ed.setHover(null);
      gesture = startMove(ctx, pending.start, ids, pending.alt ? 'Duplicate' : 'Move');
      pending = null;
      gesture.move(e);
      return;
    }
    if (pending?.kind === 'marquee') {
      const r = rectFromCorners(pending.start, e.point);
      ed.setMarquee(r);
      const hits = nodesInRect(ctx.doc(), r, { deep: e.mod });
      ed.setSelection(pending.additive ? [...pending.base, ...hits] : hits);
    }
  },

  onPointerUp(_e, ctx) {
    gesture?.end();
    gesture = null;
    pending = null;
    ctx.editor().setMarquee(null);
  },

  onCancel(ctx) {
    gesture?.cancel();
    gesture = null;
    pending = null;
    ctx.editor().setMarquee(null);
    ctx.editor().setGuides([]);
  },

  onKeyDown(e, ctx) {
    if (e.key === 'Enter' && !gesture && !pending && editSelectedPath()) return true;
    if (e.key === 'Escape') {
      if (gesture || pending) select.onCancel!(ctx);
      else ctx.editor().clearSelection();
      return true;
    }
    return false;
  },
};

export default select;
