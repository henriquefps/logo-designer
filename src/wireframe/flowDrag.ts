// The flow handle and arrow picking for the select tool (docs/wireframe-mode.md → Flows): a selected
// element inside a screen shows a small circle right of its box; dragging it draws a flow. Dropped on
// a screen it links to that logical screen; on empty canvas it opens the New screen menu. Escape
// cancels (the select tool's cancel). Clicking an arrow selects it.
//
// Parts (→ Links from parts of a component): with an instance selected, the part under the pointer (a
// bottom navigation item) is highlighted with its own handle; dragging that one links the part. From
// inside a shared component's instance, a drop asks where the link applies (FlowMenu `to`).
import { worldBounds, type Id, type Rect, type Vec } from '@/model';
import type { ToolContext, ToolPointerEvent } from '@/tools/types';
import type { Gesture } from '@/tools/select/gestures';
import { canFlowFrom, flowAt, frameAt, partAt, partInRow, partsOfId, partWorldRect } from './flows';
import { frameOf } from './screens';
import { addFlowCommand, sharedScope, useFlowStore } from './flowCommands';

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

// ---------- parts ----------

/** The selected instance whose parts can be hovered (exactly one selected element with parts), or null. */
export function partSource(ctx: Pick<ToolContext, 'doc' | 'editor'>): Id | null {
  const id = flowHandleSource(ctx);
  return id && partsOfId(ctx.doc(), id).length ? id : null;
}

/**
 * Where a part's handle sits (document space): on the top edge, centred, when other parts share its row (tabs side
 * by side), else on its right edge (rows of a list, a lone back button).
 */
export function partHandlePoint(ctx: Pick<ToolContext, 'doc'>, id: Id, key: string): { point: Vec; rect: Rect } | null {
  const doc = ctx.doc();
  const rect = partWorldRect(doc, id, key);
  if (!rect) return null;
  const row = partInRow(doc, id, key);
  return { point: row ? { x: rect.x + rect.width / 2, y: rect.y } : { x: rect.x + rect.width, y: rect.y + rect.height / 2 }, rect };
}

/** The hovered part, when its handle is under the pointer. */
export function hitPartHandle(ctx: ToolContext, point: Vec): { id: Id; part: string } | null {
  const hover = useFlowStore.getState().hoverPart;
  const id = partSource(ctx);
  if (!hover || !id || hover.nodeId !== id) return null;
  const h = partHandlePoint(ctx, id, hover.key);
  return h && Math.hypot(h.point.x - point.x, h.point.y - point.y) <= HANDLE_HIT_PX * ctx.px() ? { id, part: hover.key } : null;
}

/** Pointer moved (not pressed): which part of the selected instance it is over (kept while on its handle). */
export function updateHoverPart(ctx: ToolContext, point: Vec): void {
  const store = useFlowStore.getState();
  const id = partSource(ctx);
  if (!id || store.drag) return store.setHoverPart(null);
  if (hitPartHandle(ctx, point)) return;
  const part = partAt(ctx.doc(), id, point);
  store.setHoverPart(part ? { nodeId: id, key: part.key } : null);
}

/** The arrow under the pointer (wireframes only). */
export const hitFlowArrow = (ctx: ToolContext, point: Vec): Id | null => (ctx.doc().wireframe ? flowAt(ctx.doc(), point, ARROW_HIT_PX * ctx.px(), ctx.editor().selection) : null);

/**
 * Drag from the handle (of the element, or of one of its parts): a preview line; on release, link to the screen under
 * the pointer or open the menu. From inside a shared component's instance, the link waits for the scope menu.
 */
export function startFlowDrag(ctx: ToolContext, fromId: Id, e: ToolPointerEvent, part?: string): Gesture {
  const store = useFlowStore.getState();
  const start = (part !== undefined ? partHandlePoint(ctx, fromId, part)?.point : flowHandlePoint(ctx, fromId, ctx.editor().zoom)) ?? e.point;
  const withPart = part !== undefined ? { part } : {};
  const sourceFrame = frameOf(ctx.doc(), fromId)?.id ?? null;
  // Releasing over the source's own screen links nothing (a short drag, a change of mind), except from a part: a tab
  // that opens its own screen is what makes it the selected one there (after a real drag, not a click on the handle).
  const over = (p: Vec) => {
    const f = frameAt(ctx.doc(), p);
    if (!f) return null;
    if (f.id !== sourceFrame) return f.id;
    return part !== undefined && Math.hypot(p.x - start.x, p.y - start.y) >= 40 * ctx.px() ? f.id : null;
  };
  store.select(null);
  store.setMenu(null);
  store.setHoverPart(null);
  store.setDrag({ fromId, ...withPart, start, point: e.point, screen: e.screen, overFrame: over(e.point) });
  ctx.editor().setHover(null);
  return {
    move: (m: ToolPointerEvent) => useFlowStore.getState().setDrag({ fromId, ...withPart, start, point: m.point, screen: m.screen, overFrame: over(m.point) }),
    end: () => {
      const drag = useFlowStore.getState().drag;
      useFlowStore.getState().setDrag(null);
      if (!drag) return;
      if (drag.overFrame) {
        const f = frameOf(ctx.doc(), drag.overFrame);
        if (!f) return;
        // Inside a shared component: ask "This screen only" / "Every screen using …" first.
        if (sharedScope(fromId)) useFlowStore.getState().setMenu({ fromId, ...withPart, point: drag.point, screen: drag.screen, to: f.screen.screenId });
        else addFlowCommand(fromId, f.screen.screenId, withPart);
        return;
      }
      if (frameAt(ctx.doc(), drag.point)) return; // back on the source's screen
      if (Math.hypot(drag.point.x - start.x, drag.point.y - start.y) < 12 * ctx.px()) return; // a click on the handle
      useFlowStore.getState().setMenu({ fromId, ...withPart, point: drag.point, screen: drag.screen });
    },
    cancel: () => useFlowStore.getState().setDrag(null),
  };
}
