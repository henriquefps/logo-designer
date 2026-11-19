import { NoteIcon } from '@phosphor-icons/react';
import { addNoteCommand } from '@/wireframe/noteCommands';
import { isNoteNode } from '@/wireframe/notes';
import type { Tool } from '../types';

/**
 * Note (K, wireframe documents only): click an object or a screen to add a note attached to it
 * (placed next to it); click empty canvas, or hold Shift, for a free note at that point.
 */
const note: Tool = {
  id: 'note',
  label: 'Note',
  shortcut: 'k',
  icon: NoteIcon,
  cursor: 'crosshair',
  group: 'shape',
  order: -9,
  hint: 'Click an object or screen to attach a note to it, or empty canvas for a free note. Shift: free note.',
  when: (doc) => !!doc.wireframe,

  onPointerDown(e, ctx) {
    if (e.button !== 0 || !ctx.doc().wireframe) return;
    const hit = e.shift ? null : ctx.hitTest(e.point);
    const node = hit ? ctx.doc().children.find((c) => c.id === hit) : null;
    const target = hit && !(node && isNoteNode(node)) ? hit : undefined;
    addNoteCommand({ target, at: e.point });
    ctx.setTool('select');
  },
};

export default note;
