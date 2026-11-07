import { TextTIcon } from '@phosphor-icons/react';
import { findNode } from '@/model';
import type { Tool } from '../types';
import { commitTextEdit, createTextAt, beginTextEdit, isEditingText } from './session';
import { TextEditorOverlay } from './TextEditor';
import { TextOptions } from './TextOptions';

const text: Tool = {
  id: 'text',
  label: 'Text',
  shortcut: 't',
  icon: TextTIcon,
  cursor: 'text',
  group: 'text',
  order: 0,
  hint: 'Click to add text, click a text to edit it. Esc or a click outside finishes.',
  Overlay: TextEditorOverlay,
  Options: TextOptions,

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    // A click outside the text being edited finishes it (the editor itself stops its own clicks).
    if (isEditingText()) {
      commitTextEdit();
      return;
    }
    const hit = ctx.hitTest(e.point, { deep: true });
    const node = hit ? findNode(ctx.doc(), hit) : null;
    if (node?.type === 'text' && !node.locked) {
      beginTextEdit(node.id);
      return;
    }
    createTextAt(e.point);
  },

  onPointerMove(e, ctx) {
    if (e.pressed) return;
    const hit = ctx.hitTest(e.point, { deep: true });
    const node = hit ? findNode(ctx.doc(), hit) : null;
    ctx.editor().setHover(node?.type === 'text' ? node.id : null);
  },

  onCancel() {
    commitTextEdit();
  },

  onDeactivate(ctx) {
    commitTextEdit();
    ctx.editor().setHover(null);
  },

  onKeyDown(e, ctx) {
    // Not editing: Esc goes back to selecting.
    if (e.key === 'Escape') {
      ctx.setTool('select');
      return true;
    }
    return false;
  },
};

export default text;
