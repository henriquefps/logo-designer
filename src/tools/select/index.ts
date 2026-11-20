import { CursorIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { setReference } from '@/actions/modules/object';
import { canResizeSelection, canRotateSelection, hitTestReference, rectFromCorners, nodesInRect, locate, type Id, type Vec } from '@/model';
import { getSelectionFrame, handleAllowed, handleCursor, handlePosition, rotationHandlePosition, type SelectionFrame } from '@/canvas/selectionFrame';
import type { Tool, ToolContext, ToolPointerEvent } from '../types';
import { startMove, startResize, startRotate, type Gesture } from './gestures';
import { SelectOptions } from './SelectOptions';
import { SelectWireframeOverlay } from '@/wireframe/canvas/SelectWireframeOverlay';
import { hitFlowArrow, hitFlowHandle, hitPartHandle, startFlowDrag, updateHoverPart } from '@/wireframe/flowDrag';
import { removeFlowCommand, selectFlow, useFlowStore } from '@/wireframe/flowCommands';
import { editPathAt, editSelectedPath } from '@/vector/commands';
import { editTextOnDoubleClick, isDoubleClick } from '../text/session';

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
  if (!canResizeSelection(ctx.doc(), ids)) return null; // e.g. notes: move only
  const frame = getSelectionFrame(ctx.doc(), ids);
  if (!frame) return null;
  const tol = HANDLE_HIT_PX * ctx.px();
  const near = (p: Vec) => Math.hypot(p.x - e.point.x, p.y - e.point.y) <= tol;
  if (canRotateSelection(ctx.doc(), ids) && near(rotationHandlePosition(frame, ed.zoom))) return { kind: 'rotate', frame };
  const tiny = frame.width / ctx.px() < 16 || frame.height / ctx.px() < 16;
  for (let i = 0; i < 8; i++) {
    if (tiny && i % 2 === 1) continue; // only corners on tiny boxes
    if (!handleAllowed(ctx.doc(), ids, i)) continue; // an axis the component cannot be sized in
    if (near(handlePosition(frame, i))) return { kind: 'resize', index: i, frame };
  }
  return null;
}

/** Root-to-leaf chain of ids (groups first) for the deepest node under the point. */
function hitChain(ctx: ToolContext, point: Vec): Id[] {
  const deep = ctx.hitTest(point, { deep: true });
  const loc = deep ? locate(ctx.doc(), deep) : null;
  return loc ? [...loc.ancestors.map((a) => a.id), deep!] : [];
}

const hinted = new Set<Id>();

/** A click that selects nothing because only a reference layer is under it: say so once per layer. */
function hintReference(ctx: ToolContext, point: Vec) {
  if (!ctx.editor().showReferences) return;
  const ref = hitTestReference(ctx.doc(), point, ctx.px() * 2);
  if (!ref || hinted.has(ref.id)) return;
  hinted.add(ref.id);
  toast(`“${ref.name}” is a reference layer`, {
    description: 'Reference layers cannot be selected on the canvas. Click the reference icon on its row in Layers to make it editable.',
    action: { label: 'Make editable', onClick: () => setReference(false, [ref.id]) },
  });
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
  Overlay: SelectWireframeOverlay,

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    if (isDoubleClick(e) && editTextOnDoubleClick(ctx.hitTest(e.point, { deep: true }))) return;
    const ed = ctx.editor();
    // Wireframes: the flow handle of the selected element (or of its hovered part), then the flow arrows.
    const partFrom = hitPartHandle(ctx, e.point);
    if (partFrom) {
      gesture = startFlowDrag(ctx, partFrom.id, e, partFrom.part);
      return;
    }
    const flowFrom = hitFlowHandle(ctx, e.point);
    if (flowFrom) {
      gesture = startFlowDrag(ctx, flowFrom, e);
      return;
    }
    if (useFlowStore.getState().selected) selectFlow(null);
    const handle = hitHandle(ctx, e);
    if (handle) {
      gesture =
        handle.kind === 'rotate'
          ? startRotate(ctx, e.point, handle.frame, ed.selection)
          : startResize(ctx, handle.index, handle.frame, ed.selection);
      return;
    }
    const chain = hitChain(ctx, e.point);
    // The deepest already-selected node under the pointer (after drilling into a group).
    let selectedLevel = -1;
    chain.forEach((id, i) => {
      if (ed.selection.includes(id)) selectedLevel = i;
    });
    if (e.detail === 2 && !e.shift && chain.length) {
      // Double-click on a group steps into it (one level per double-click), like Illustrator;
      // on a leaf it edits points.
      if (selectedLevel < chain.length - 1 && chain.length > 1) {
        ed.setSelection([chain[selectedLevel + 1]]);
        pending = { kind: 'move', start: e.point, screen: e.screen, alt: false };
        return;
      }
      if (editPathAt(chain[chain.length - 1])) return;
    }
    const arrow = !e.shift && !e.mod ? hitFlowArrow(ctx, e.point) : null;
    if (arrow) {
      selectFlow(arrow);
      return;
    }
    const hit = e.mod ? ctx.hitTest(e.point, { deep: true }) : selectedLevel > 0 ? chain[selectedLevel] : ctx.hitTest(e.point);
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
    hintReference(ctx, e.point);
    pending = { kind: 'marquee', start: e.point, additive: e.shift, base: e.shift ? ed.selection : [] };
  },

  onPointerMove(e, ctx) {
    const ed = ctx.editor();
    if (!e.pressed) {
      // Hover: cursor over handles + hover outline.
      if (ctx.doc().wireframe) updateHoverPart(ctx, e.point);
      if (hitPartHandle(ctx, e.point) || hitFlowHandle(ctx, e.point)) {
        ed.setCursor('crosshair');
        ed.setHover(null);
        return;
      }
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
    const flow = useFlowStore.getState().selected;
    if (flow && !gesture && (e.key === 'Delete' || e.key === 'Backspace')) {
      removeFlowCommand(flow);
      return true;
    }
    if (e.key === 'Escape' && flow && !gesture && !pending) {
      selectFlow(null);
      return true;
    }
    if (e.key === 'Escape') {
      if (gesture || pending) select.onCancel!(ctx);
      else ctx.editor().clearSelection();
      return true;
    }
    return false;
  },
};

export default select;
