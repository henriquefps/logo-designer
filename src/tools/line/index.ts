import { LineSegmentIcon } from '@phosphor-icons/react';
import { defaultStroke, IDENTITY, none, solid, type Id, type Vec } from '@/model';
import { snapPoint, SNAP_PX } from '@/canvas/snapping';
import { pathFromWorld } from '@/vector/convert';
import { constrain45, dist } from '@/vector/geometry';
import { snapTargetsExcluding } from '../select/gestures';
import type { Tool, ToolContext, ToolPointerEvent } from '../types';

let start: Vec | null = null;
let startScreen: Vec | null = null;
let nodeId: Id | null = null;

function endPoint(e: ToolPointerEvent, ctx: ToolContext): Vec {
  let p = e.point;
  const ed = ctx.editor();
  if (ed.snapping && !e.mod && !e.shift) {
    const s = snapPoint(p, snapTargetsExcluding(ctx.doc(), nodeId ? [nodeId] : []), SNAP_PX * ctx.px());
    p = s.point;
    ed.setGuides(s.guides);
  } else ed.setGuides([]);
  return e.shift ? constrain45(start!, p) : p;
}

const lineNode = (a: Vec, b: Vec, id?: Id) => {
  const n = pathFromWorld(
    [{ closed: false, points: [{ ...a, type: 'corner' }, { ...b, type: 'corner' }] }],
    IDENTITY,
    { name: 'Line', fill: none(), stroke: { ...defaultStroke(solid('#000000'), 2), cap: 'round' } },
  );
  return id ? { ...n, id } : n;
};

function reset(ctx: ToolContext) {
  start = null;
  startScreen = null;
  nodeId = null;
  ctx.editor().setGuides([]);
}

const line: Tool = {
  id: 'line',
  label: 'Line',
  shortcut: '\\',
  icon: LineSegmentIcon,
  cursor: 'crosshair',
  group: 'shape',
  order: 2,
  hint: 'Drag to draw a line. Shift constrains to 45°.',

  onPointerDown(e) {
    if (e.button !== 0) return;
    start = e.point;
    startScreen = e.screen;
  },

  onPointerMove(e, ctx) {
    if (!e.pressed || !start || !startScreen) return;
    const store = ctx.docStore();
    if (!nodeId) {
      if (dist(e.screen, startScreen) < 3) return;
      store.beginTransaction('Draw line');
      const n = lineNode(start, endPoint(e, ctx));
      nodeId = n.id;
      store.addNodes([n]);
      ctx.editor().setSelection([n.id]);
      return;
    }
    const prev = store.findNode(nodeId);
    const next = lineNode(start, endPoint(e, ctx), nodeId);
    if (prev?.type === 'path') store.replaceNodes([{ ...next, stroke: prev.stroke, name: prev.name }]);
  },

  onPointerUp(_e, ctx) {
    if (nodeId) ctx.docStore().commitTransaction();
    reset(ctx);
  },

  onCancel(ctx) {
    if (nodeId) ctx.docStore().cancelTransaction();
    reset(ctx);
  },

  onKeyDown(e, ctx) {
    if (e.key === 'Escape' && start) {
      line.onCancel!(ctx);
      return true;
    }
    return false;
  },
};

export default line;
