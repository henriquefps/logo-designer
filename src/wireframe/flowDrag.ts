// The flow handle and arrow picking for the select tool (docs/wireframe-mode.md → Flows): a selected
// element inside a screen shows a small circle right of its box; dragging it draws a flow. Dropped on
// a screen it links to that logical screen; on empty canvas it opens the New screen menu. Escape
// cancels (the select tool's cancel). Clicking an arrow selects it.
import { worldBounds, type Id, type Vec } from '@/model';
import type { ToolContext, ToolPointerEvent } from '@/tools/types';
import type { Gesture } from '@/tools/select/gestures';
import { canFlowFrom, flowAt, frameAt } from './flows';
import { frameOf } from './screens';
import { addFlowCommand, useFlowStore } from './flowCommands';

/** Gap between the element's right edge and the handle's centre, and the handle's radius (screen px). */
export const FLOW_HANDLE_OFFSET_PX = 18;
export const FLOW_HANDLE_RADIUS_PX = 6;
const HANDLE_HIT_PX = 9;
const ARROW_HIT_PX = 5;

/** The element that shows a flow handle: exactly one selected node, inside a screen. */
export function flowHandleSource(ctx: Pick<ToolContext, 'doc' | 'editor'>): Id | null {
  const doc = ctx.doc();
  const sel = ctx.editor().selection;
  if (!doc.wireframe || sel.length !== 1 || ctx.editor().tool !== 'select') return null;
  return canFlowFrom(doc, sel[0]) ? sel[0] : null;
}

/** The handle's centre in document space for `zoom`, or null. */
export function flowHandlePoint(ctx: Pick<ToolContext, 'doc'>, id: Id, zoom: number): Vec | null {
  const r = worldBounds(ctx.doc(), id);
  if (!r) return null;
  return { x: r.x + r.width + FLOW_HANDLE_OFFSET_PX / zoom, y: r.y + r.height / 2 };
}

/** The source id when the pointer is on the flow handle. */
export function hitFlowHandle(ctx: ToolContext, point: Vec): Id | null {
  const id = flowHandleSource(ctx);
  if (!id) return null;
  const p = flowHandlePoint(ctx, id, ctx.editor().zoom);
  return p && Math.hypot(p.x - point.x, p.y - point.y) <= HANDLE_HIT_PX * ctx.px() ? id : null;
}

/** The arrow under the pointer (wireframes only). */
export const hitFlowArrow = (ctx: ToolContext, point: Vec): Id | null => (ctx.doc().wireframe ? flowAt(ctx.doc(), point, ARROW_HIT_PX * ctx.px()) : null);

/** Drag from the handle: a preview line; on release, link to the screen under the pointer or open the menu. */
export function startFlowDrag(ctx: ToolContext, fromId: Id, e: ToolPointerEvent): Gesture {
  const store = useFlowStore.getState();
  const start = flowHandlePoint(ctx, fromId, ctx.editor().zoom) ?? e.point;
  const sourceFrame = frameOf(ctx.doc(), fromId)?.id ?? null;
  // Releasing over the source's own screen links nothing (a short drag, a change of mind).
  const over = (p: Vec) => {
    const f = frameAt(ctx.doc(), p);
    return f && f.id !== sourceFrame ? f.id : null;
  };
  store.select(null);
  store.setMenu(null);
  store.setDrag({ fromId, start, point: e.point, screen: e.screen, overFrame: over(e.point) });
  ctx.editor().setHover(null);
  return {
    move: (m: ToolPointerEvent) => useFlowStore.getState().setDrag({ fromId, start, point: m.point, screen: m.screen, overFrame: over(m.point) }),
    end: () => {
      const drag = useFlowStore.getState().drag;
      useFlowStore.getState().setDrag(null);
      if (!drag) return;
      if (drag.overFrame) {
        const f = frameOf(ctx.doc(), drag.overFrame);
        if (f) addFlowCommand(fromId, f.screen.screenId);
        return;
      }
      if (frameAt(ctx.doc(), drag.point)) return; // back on the source's screen
      if (Math.hypot(drag.point.x - start.x, drag.point.y - start.y) < 12 * ctx.px()) return; // a click on the handle
      useFlowStore.getState().setMenu({ fromId, point: drag.point, screen: drag.screen });
    },
    cancel: () => useFlowStore.getState().setDrag(null),
  };
}
