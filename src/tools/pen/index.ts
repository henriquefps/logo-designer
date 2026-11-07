import { PenNibIcon } from '@phosphor-icons/react';
import { lineStyle, shapeStyle } from '@/store/usePaintDefaults';
import { apply, createPath, invert, worldMatrix, type BezierPoint, type Id, type PathNode, type Vec } from '@/model';
import { snapPoint, SNAP_PX, snapEnabled } from '@/canvas/snapping';
import { constrain45, dist, inferPointType, mirror } from '@/vector/geometry';
import { snapTargetsExcluding } from '../select/gestures';
import type { Tool, ToolContext, ToolPointerEvent } from '../types';
import { PenOverlay } from './PenOverlay';
import { usePen } from './state';

const CLOSE_PX = 8;
const DRAG_PX = 2;

interface Drag {
  index: number;
  anchor: Vec; // local coords
  screen: Vec;
  closing: boolean;
  /** Dragging from the last anchor: only its out handle changes. */
  outOnly: boolean;
  dragged: boolean;
}
let drag: Drag | null = null;

const activePath = (ctx: ToolContext): PathNode | null => {
  const id = usePen.getState().nodeId;
  const n = id ? ctx.docStore().findNode(id) : null;
  return n?.type === 'path' ? n : null;
};

const toLocal = (ctx: ToolContext, id: Id, p: Vec) => apply(invert(worldMatrix(ctx.doc(), id)), p);

function snapped(e: ToolPointerEvent, ctx: ToolContext): Vec {
  const ed = ctx.editor();
  if (!snapEnabled() || e.mod) {
    ed.setGuides([]);
    return e.point;
  }
  const id = usePen.getState().nodeId;
  const s = snapPoint(e.point, snapTargetsExcluding(ctx.doc(), id ? [id] : []), SNAP_PX * ctx.px());
  ed.setGuides(s.guides);
  return s.point;
}

/** Ends the current path (open). A path with a single point is removed. */
function finish(ctx: ToolContext) {
  if (drag) ctx.docStore().commitTransaction();
  drag = null;
  const path = activePath(ctx);
  if (path && path.subpaths[0]?.points.length < 2) {
    // Only the first click happened: undo its "add path" step.
    const store = ctx.docStore();
    if (store.past[store.past.length - 1]?.label === 'Pen') store.undo();
    if (store.findNode(path.id)) store.deleteNodes([path.id]);
  }
  usePen.setState({ nodeId: null, hover: null, closeHover: false });
  ctx.editor().setGuides([]);
}

function updateDragged(ctx: ToolContext, e: ToolPointerEvent) {
  if (!drag) return;
  const path = activePath(ctx);
  if (!path) return;
  let h = toLocal(ctx, path.id, e.point);
  if (e.shift) h = constrain45(drag.anchor, h);
  const sp = path.subpaths[0];
  const points = sp.points.map((p) => ({ ...p }));
  const p: BezierPoint = { ...points[drag.index] };
  if (drag.closing) {
    // Closing on the first point: Alt changes only the incoming handle.
    p.in = mirror(h, drag.anchor);
    if (!e.alt) p.out = h;
  } else {
    p.out = h;
    if (!e.alt && !drag.outOnly) p.in = mirror(h, drag.anchor);
  }
  p.type = inferPointType(p);
  points[drag.index] = p;
  ctx.docStore().replaceNodes([{ ...path, subpaths: [{ ...sp, points }] }]);
}

const pen: Tool = {
  id: 'pen',
  label: 'Pen',
  shortcut: 'p',
  icon: PenNibIcon,
  cursor: 'crosshair',
  group: 'draw',
  order: 0,
  hint: 'Click for corners, drag for curves (Alt breaks the handles). Click the first point to close; Enter or Esc ends.',
  Overlay: PenOverlay,

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    const store = ctx.docStore();
    const tol = CLOSE_PX * ctx.px();
    let path = activePath(ctx);
    if (path && path.subpaths[0]?.closed) path = null;
    if (!path) {
      const p = snapped(e, ctx);
      const node = createPath({
        name: 'Path',
        subpaths: [{ closed: false, points: [{ x: 0, y: 0, type: 'corner' }] }],
        ...lineStyle(),
        transform: { x: p.x, y: p.y },
      });
      store.beginTransaction('Pen');
      store.addNodes([node]);
      ctx.editor().setSelection([node.id]);
      usePen.setState({ nodeId: node.id, hover: null, closeHover: false });
      drag = { index: 0, anchor: { x: 0, y: 0 }, screen: e.screen, closing: false, outOnly: false, dragged: false };
      return;
    }
    const sp = path.subpaths[0];
    const first = sp.points[0];
    const last = sp.points[sp.points.length - 1];
    const firstW = apply(worldMatrix(ctx.doc(), path.id), first);
    const lastW = apply(worldMatrix(ctx.doc(), path.id), last);
    if (sp.points.length >= 2 && dist(firstW, e.point) <= tol) {
      store.beginTransaction('Close path');
      // A closed path takes the current fill and stroke (it was drawn with the line style).
      store.replaceNodes([{ ...path, ...shapeStyle(), subpaths: [{ ...sp, closed: true }] }]);
      drag = { index: 0, anchor: { x: first.x, y: first.y }, screen: e.screen, closing: true, outOnly: false, dragged: false };
      return;
    }
    if (dist(lastW, e.point) <= tol) {
      // Click on the last anchor removes its out handle (next segment starts as a corner).
      store.beginTransaction('Pen');
      const points = sp.points.map((p, i) => {
        if (i !== sp.points.length - 1) return p;
        const q: BezierPoint = { ...p, type: 'corner' };
        delete q.out;
        return q;
      });
      store.replaceNodes([{ ...path, subpaths: [{ ...sp, points }] }]);
      drag = { index: sp.points.length - 1, anchor: { x: last.x, y: last.y }, screen: e.screen, closing: false, outOnly: true, dragged: false };
      return;
    }
    let p = snapped(e, ctx);
    if (e.shift) p = constrain45(lastW, p);
    const local = toLocal(ctx, path.id, p);
    store.beginTransaction('Add point');
    store.replaceNodes([{ ...path, subpaths: [{ ...sp, points: [...sp.points, { x: local.x, y: local.y, type: 'corner' }] }] }]);
    drag = { index: sp.points.length, anchor: local, screen: e.screen, closing: false, outOnly: false, dragged: false };
  },

  onPointerMove(e, ctx) {
    if (e.pressed && drag) {
      if (!drag.dragged && dist(e.screen, drag.screen) < DRAG_PX) return;
      drag.dragged = true;
      ctx.editor().setGuides([]);
      updateDragged(ctx, e);
      return;
    }
    if (e.pressed) return;
    const path = activePath(ctx);
    if (!path || path.subpaths[0]?.closed) {
      snapped(e, ctx);
      usePen.setState({ hover: null, closeHover: false });
      return;
    }
    const sp = path.subpaths[0];
    const m = worldMatrix(ctx.doc(), path.id);
    const firstW = apply(m, sp.points[0]);
    const lastW = apply(m, sp.points[sp.points.length - 1]);
    const closeHover = sp.points.length >= 2 && dist(firstW, e.point) <= CLOSE_PX * ctx.px();
    let p = closeHover ? firstW : snapped(e, ctx);
    if (!closeHover && e.shift) p = constrain45(lastW, p);
    usePen.setState({ hover: p, closeHover });
    ctx.editor().setCursor(closeHover ? 'cell' : 'crosshair');
  },

  onPointerUp(_e, ctx) {
    if (!drag) return;
    const closing = drag.closing;
    ctx.docStore().commitTransaction();
    drag = null;
    if (closing) {
      usePen.setState({ nodeId: null, hover: null, closeHover: false });
      ctx.editor().setCursor('crosshair');
    }
  },

  onCancel(ctx) {
    finish(ctx);
  },

  onDeactivate(ctx) {
    finish(ctx);
  },

  onKeyDown(e, ctx) {
    if ((e.key === 'Enter' || e.key === 'Escape') && usePen.getState().nodeId) {
      finish(ctx);
      return true;
    }
    return false;
  },
};

export default pen;
