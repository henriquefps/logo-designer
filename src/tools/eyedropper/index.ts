import { EyedropperIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { findNode, isPainted } from '@/model';
import { applyStyleFrom } from '@/vector/commands';
import type { Tool } from '../types';

const eyedropper: Tool = {
  id: 'eyedropper',
  label: 'Eyedropper',
  shortcut: 'i',
  icon: EyedropperIcon,
  cursor: 'copy',
  group: 'paint',
  order: 0,
  hint: 'Click an object to copy its fill and stroke into the selection.',

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    const hit = ctx.hitTest(e.point, { deep: true });
    const src = hit ? findNode(ctx.doc(), hit) : null;
    if (!src || !isPainted(src)) return;
    if (!ctx.editor().selection.length) {
      toast('Select the objects to paint first, then click a source with the eyedropper');
      return;
    }
    applyStyleFrom(src.id);
  },

  onPointerMove(e, ctx) {
    if (e.pressed) return;
    ctx.editor().setHover(ctx.hitTest(e.point, { deep: true }));
  },
};

export default eyedropper;
