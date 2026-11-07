import { PaintBrushIcon } from '@phosphor-icons/react';
import { brushPaint } from '@/store/usePaintDefaults';
import { defaultStroke, IDENTITY } from '@/model';
import { brushOutline, decimate, type FreehandPoint } from '@/vector/freehand';
import { pathFromWorld } from '@/vector/convert';
import { loadPaper, polygonToSmoothSubpaths } from '@/vector/paperOps';
import type { Tool, ToolPointerEvent } from '../types';
import { BrushOptions } from './BrushOptions';
import { BrushOverlay } from './BrushOverlay';
import { useBrush } from './state';

let drawing = false;

/** Stylus input keeps its real pressure; mouse and touch get simulated pressure. */
const sample = (e: ToolPointerEvent): FreehandPoint => (e.pointerType === 'pen' && e.pressure > 0 ? { ...e.point, pressure: e.pressure } : { ...e.point });

const brush: Tool = {
  id: 'brush',
  label: 'Brush',
  shortcut: 'b',
  icon: PaintBrushIcon,
  cursor: 'crosshair',
  group: 'draw',
  order: 2,
  Options: BrushOptions,
  Overlay: BrushOverlay,

  onActivate() {
    void loadPaper();
  },

  onPointerDown(e) {
    if (e.button !== 0) return;
    drawing = true;
    useBrush.setState({ points: [sample(e)] });
  },

  onPointerMove(e) {
    if (!e.pressed || !drawing) return;
    useBrush.setState((s) => ({ points: [...s.points, sample(e)] }));
  },

  async onPointerUp(_e, ctx) {
    if (!drawing) return;
    drawing = false;
    const { points: raw, size, thinning } = useBrush.getState();
    const points = decimate(raw, ctx.px() * 0.5);
    // A single click still leaves a dot.
    const outline = brushOutline(points.length === 1 ? [points[0], { ...points[0], x: points[0].x + 0.01 }] : points, { size, thinning });
    const scope = await loadPaper();
    const subpaths = polygonToSmoothSubpaths(scope, outline, Math.max(0.1, size / 40));
    useBrush.setState({ points: [] });
    if (!subpaths.length) return;
    const node = pathFromWorld(subpaths, IDENTITY, { name: 'Brush stroke', fill: brushPaint(), stroke: defaultStroke(), fillRule: 'nonzero' });
    ctx.docStore().addNodes([node], { label: 'Brush' });
    ctx.editor().setSelection([node.id]);
  },

  onCancel() {
    drawing = false;
    useBrush.setState({ points: [] });
  },
};

export default brush;
