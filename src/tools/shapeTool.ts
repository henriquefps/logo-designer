import type { Icon } from '@phosphor-icons/react';
import { rectFromCorners, type Rect, type SceneNode, type Vec } from '@/model';
import { snapPoint, SNAP_PX, snapEnabled } from '@/canvas/snapping';
import { snapTargetsExcluding } from './select/gestures';
import type { Tool, ToolContext, ToolPointerEvent } from './types';

/**
 * Factory for "drag a box to create a shape" tools (rectangle, ellipse, and later polygon/star/image).
 * Shift constrains to a square, Alt draws from the center. A plain click creates a default-size shape.
 */
export interface ShapeToolSpec {
  id: string;
  label: string;
  shortcut?: string;
  icon: Icon;
  order: number;
  /** Builds the node for a box in document coordinates. */
  create: (box: Rect) => SceneNode;
  /** Updates the node for a new box (return a full replacement). */
  update: (node: SceneNode, box: Rect) => SceneNode;
  defaultSize?: number;
  hint?: string;
}

export function createShapeTool(spec: ShapeToolSpec): Tool {
  let start: Vec | null = null;
  let startScreen: Vec | null = null;
  let nodeId: string | null = null;

  const boxFor = (e: ToolPointerEvent, ctx: ToolContext): Rect => {
    let p = e.point;
    const ed = ctx.editor();
    if (snapEnabled() && !e.mod) {
      const s = snapPoint(p, snapTargetsExcluding(ctx.doc(), nodeId ? [nodeId] : []), SNAP_PX * ctx.px());
      p = s.point;
      ed.setGuides(s.guides);
    }
    let dx = p.x - start!.x;
    let dy = p.y - start!.y;
    if (e.shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * m;
      dy = Math.sign(dy || 1) * m;
    }
    if (e.alt) return rectFromCorners({ x: start!.x - dx, y: start!.y - dy }, { x: start!.x + dx, y: start!.y + dy });
    return rectFromCorners(start!, { x: start!.x + dx, y: start!.y + dy });
  };

  const reset = (ctx: ToolContext) => {
    start = null;
    startScreen = null;
    nodeId = null;
    ctx.editor().setGuides([]);
  };

  return {
    id: spec.id,
    label: spec.label,
    shortcut: spec.shortcut,
    icon: spec.icon,
    cursor: 'crosshair',
    group: 'shape',
    order: spec.order,
    hint: spec.hint ?? 'Drag to draw. Shift keeps proportions, Alt draws from the center.',

    onPointerDown(e) {
      if (e.button !== 0) return;
      start = e.point;
      startScreen = e.screen;
    },

    onPointerMove(e, ctx) {
      if (!e.pressed || !start || !startScreen) return;
      if (!nodeId) {
        if (Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) < 3) return;
        const store = ctx.docStore();
        store.beginTransaction(`Draw ${spec.label.toLowerCase()}`);
        const node = spec.create(boxFor(e, ctx));
        nodeId = node.id;
        store.addNodes([node]);
        ctx.editor().setSelection([node.id]);
        return;
      }
      const store = ctx.docStore();
      const node = store.findNode(nodeId);
      if (node) store.replaceNodes([spec.update(node, boxFor(e, ctx))]);
    },

    onPointerUp(e, ctx) {
      if (!start) return;
      const store = ctx.docStore();
      if (nodeId) {
        store.commitTransaction();
      } else {
        const size = spec.defaultSize ?? 100;
        const node = spec.create({ x: e.point.x - size / 2, y: e.point.y - size / 2, width: size, height: size });
        store.addNodes([node]);
        ctx.editor().setSelection([node.id]);
      }
      reset(ctx);
    },

    onCancel(ctx) {
      if (nodeId) ctx.docStore().cancelTransaction();
      reset(ctx);
    },

    onKeyDown(e, ctx) {
      if (e.key === 'Escape' && start) {
        this.onCancel!(ctx);
        return true;
      }
      return false;
    },
  };
}
