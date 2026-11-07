import { PaintBrushIcon } from '@phosphor-icons/react';
import { defaultStroke, IDENTITY, solid } from '@/model';
import { brushOutline, decimate } from '@/vector/freehand';
import { pathFromWorld } from '@/vector/convert';
import { loadPaper, polygonToSmoothSubpaths } from '@/vector/paperOps';
import type { Tool } from '../types';
import { BrushOptions } from './BrushOptions';
import { BrushOverlay } from './BrushOverlay';
import { useBrush } from './state';

let drawing = false;

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
    useBrush.setState({ points: [e.point] });
  },

  onPointerMove(e) {
    if (!e.pressed || !drawing) return;
    useBrush.setState((s) => ({ points: [...s.points, e.point] }));
  },

  async onPointerUp(_e, ctx) {
    if (!drawing) return;
    drawing = false;
    const { points: raw, size, thinning } = useBrush.getState();
    const points = decimate(raw, ctx.px() * 0.5);
    // A single click still leaves a dot.
    const outline = brushOutline(points.length === 1 ? [points[0], { x: points[0].x + 0.01, y: points[0].y }] : points, { size, thinning });
    const scope = await loadPaper();
    const subpaths = polygonToSmoothSubpaths(scope, outline, Math.max(0.1, size / 40));
    useBrush.setState({ points: [] });
    if (!subpaths.length) return;
    const node = pathFromWorld(subpaths, IDENTITY, { name: 'Brush stroke', fill: solid('#000000'), stroke: defaultStroke(), fillRule: 'nonzero' });
    ctx.docStore().addNodes([node], { label: 'Brush' });
    ctx.editor().setSelection([node.id]);
  },

  onCancel() {
    drawing = false;
    useBrush.setState({ points: [] });
  },
};

export default brush;
