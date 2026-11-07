import { PencilSimpleIcon } from '@phosphor-icons/react';
import { defaultStroke, IDENTITY, none, solid } from '@/model';
import { decimate, shouldClose, smoothnessToTolerance } from '@/vector/freehand';
import { pathFromWorld } from '@/vector/convert';
import { fitCurve, loadPaper } from '@/vector/paperOps';
import type { Tool } from '../types';
import { PencilOptions } from './PencilOptions';
import { PencilOverlay } from './PencilOverlay';
import { usePencil } from './state';

const CLOSE_PX = 10;
let drawing = false;

const pencil: Tool = {
  id: 'pencil',
  label: 'Pencil',
  shortcut: 'n',
  icon: PencilSimpleIcon,
  cursor: 'crosshair',
  group: 'draw',
  order: 1,
  Options: PencilOptions,
  Overlay: PencilOverlay,

  onActivate() {
    void loadPaper();
  },

  onPointerDown(e) {
    if (e.button !== 0) return;
    drawing = true;
    usePencil.setState({ points: [e.point] });
  },

  onPointerMove(e) {
    if (!e.pressed || !drawing) return;
    usePencil.setState((s) => ({ points: [...s.points, e.point] }));
  },

  async onPointerUp(_e, ctx) {
    if (!drawing) return;
    drawing = false;
    const px = ctx.px();
    const { points: raw, smoothness } = usePencil.getState();
    const points = decimate(raw, px);
    if (points.length < 2) {
      usePencil.setState({ points: [] });
      return;
    }
    const closed = shouldClose(points, CLOSE_PX * px);
    if (closed) points.pop();
    const scope = await loadPaper();
    const sp = fitCurve(scope, points, smoothnessToTolerance(smoothness) * px, closed);
    const node = pathFromWorld([sp], IDENTITY, {
      name: 'Pencil',
      fill: none(),
      stroke: { ...defaultStroke(solid('#000000'), 2), cap: 'round', join: 'round' },
    });
    ctx.docStore().addNodes([node], { label: 'Pencil' });
    ctx.editor().setSelection([node.id]);
    usePencil.setState({ points: [] });
  },

  onCancel() {
    drawing = false;
    usePencil.setState({ points: [] });
  },
};

export default pencil;
