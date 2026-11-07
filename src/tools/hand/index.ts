import { HandIcon } from '@phosphor-icons/react';
import type { Vec } from '@/model';
import type { Tool } from '../types';

let drag: { screen: Vec; pan: Vec } | null = null;

const hand: Tool = {
  id: 'hand',
  label: 'Hand',
  shortcut: 'h',
  icon: HandIcon,
  cursor: 'grab',
  group: 'view',
  order: 0,
  hint: 'Drag to pan. Hold Space with any tool to pan.',
  onPointerDown(e, ctx) {
    drag = { screen: e.screen, pan: ctx.editor().pan };
    ctx.editor().setCursor('grabbing');
  },
  onPointerMove(e, ctx) {
    if (!e.pressed || !drag) return;
    ctx.editor().setPan({ x: drag.pan.x + e.screen.x - drag.screen.x, y: drag.pan.y + e.screen.y - drag.screen.y });
  },
  onPointerUp(_e, ctx) {
    drag = null;
    ctx.editor().setCursor('grab');
  },
  onCancel(ctx) {
    drag = null;
    ctx.editor().setCursor('grab');
  },
};

export default hand;
