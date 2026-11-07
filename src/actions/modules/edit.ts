import { ArrowArcLeftIcon, ArrowArcRightIcon, CopyIcon, ScissorsIcon, ClipboardIcon, TrashIcon } from '@phosphor-icons/react';
import { walk } from '@/model';
import { copyNodes, cutNodes, hasClipboard, pasteNodes } from '@/store/clipboard';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { doc, editableSelection, hasSelection, sel } from '../selection';
import type { Action } from '../types';

const ds = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

const actions: Action[] = [
  {
    id: 'edit.undo',
    label: 'Undo',
    menu: 'edit',
    group: 'history',
    order: 0,
    icon: ArrowArcLeftIcon,
    shortcut: 'mod+z',
    enabled: () => ds().past.length > 0 || !!ds().txn,
    run: () => {
      ds().undo();
      pruneSelection();
    },
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    menu: 'edit',
    group: 'history',
    order: 1,
    icon: ArrowArcRightIcon,
    shortcut: ['mod+shift+z', 'mod+y'],
    enabled: () => ds().future.length > 0,
    run: () => {
      ds().redo();
      pruneSelection();
    },
  },
  {
    id: 'edit.cut',
    label: 'Cut',
    menu: 'edit',
    group: 'clipboard',
    order: 10,
    icon: ScissorsIcon,
    shortcut: 'mod+x',
    enabled: hasSelection,
    run: () => {
      cutNodes(editableSelection());
      ed().clearSelection();
    },
  },
  {
    id: 'edit.copy',
    label: 'Copy',
    menu: 'edit',
    group: 'clipboard',
    order: 11,
    icon: CopyIcon,
    shortcut: 'mod+c',
    enabled: hasSelection,
    run: () => void copyNodes(sel()),
  },
  {
    id: 'edit.paste',
    label: 'Paste',
    menu: 'edit',
    group: 'clipboard',
    order: 12,
    icon: ClipboardIcon,
    shortcut: 'mod+v',
    enabled: hasClipboard,
    run: () => ed().setSelection(pasteNodes()),
  },
  {
    id: 'edit.duplicate',
    label: 'Duplicate',
    menu: 'edit',
    group: 'clipboard',
    order: 13,
    shortcut: 'mod+d',
    enabled: hasSelection,
    run: () => ed().setSelection(ds().duplicate(editableSelection())),
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    menu: 'edit',
    group: 'clipboard',
    order: 14,
    icon: TrashIcon,
    shortcut: ['delete', 'backspace'],
    enabled: hasSelection,
    run: () => {
      ds().deleteNodes(editableSelection());
      ed().clearSelection();
    },
  },
  {
    id: 'edit.selectAll',
    label: 'Select all',
    menu: 'edit',
    group: 'select',
    order: 20,
    shortcut: 'mod+a',
    run: () => ed().setSelection(doc().children.filter((n) => n.visible && !n.locked).map((n) => n.id)),
  },
  {
    id: 'edit.deselect',
    label: 'Deselect',
    menu: 'edit',
    group: 'select',
    order: 21,
    shortcut: 'mod+shift+a',
    enabled: hasSelection,
    run: () => ed().clearSelection(),
  },
];

/** Drops ids that no longer exist (after undo/redo). */
function pruneSelection() {
  const ids = new Set<string>();
  walk(doc().children, (n) => void ids.add(n.id));
  const next = sel().filter((id) => ids.has(id));
  if (next.length !== sel().length) ed().setSelection(next);
}

export default actions;
