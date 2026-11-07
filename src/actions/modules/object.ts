import { applyWorldMatrix, findNode, parentWorldMatrix, rectCenter, scaleAbout, selectionBounds, walk } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { doc, editableSelection, hasSelection, sel } from '../selection';
import type { Action } from '../types';

const ds = () => useDocStore.getState();
const ed = () => useEditorStore.getState();
const isGroupSelected = () => sel().some((id) => findNode(doc(), id)?.type === 'group');

function flip(axis: 'x' | 'y') {
  const ids = editableSelection();
  const b = selectionBounds(doc(), ids);
  if (!b) return;
  const c = rectCenter(b);
  const m = scaleAbout(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, c);
  const d = doc();
  ds().replaceNodes(
    ids.map((id) => applyWorldMatrix(findNode(d, id)!, parentWorldMatrix(d, id), m)),
    { label: axis === 'x' ? 'Flip horizontal' : 'Flip vertical' },
  );
}

/** Marks nodes as tracing references (locked, not selectable on canvas) or restores them. */
export function setReference(on: boolean, ids: string[] = sel()) {
  ds().updateNodes(
    ids,
    (n) => {
      if (on) {
        n.reference = true;
        n.locked = true;
      } else {
        delete n.reference;
        n.locked = false;
      }
    },
    { label: on ? 'Use as reference' : 'Stop using as reference' },
  );
  if (on) ed().clearSelection();
}

const actions: Action[] = [
  {
    id: 'object.group',
    label: 'Group',
    menu: 'object',
    group: 'group',
    order: 0,
    shortcut: 'mod+g',
    enabled: () => editableSelection().length > 0,
    run: () => {
      const id = ds().group(editableSelection());
      if (id) ed().setSelection([id]);
    },
  },
  {
    id: 'object.ungroup',
    label: 'Ungroup',
    menu: 'object',
    group: 'group',
    order: 1,
    shortcut: 'mod+shift+g',
    enabled: isGroupSelected,
    run: () => {
      const groups = sel().filter((id) => findNode(doc(), id)?.type === 'group');
      const others = sel().filter((id) => !groups.includes(id));
      ed().setSelection([...others, ...ds().ungroup(groups)]);
    },
  },
  ...(
    [
      ['front', 'Bring to front', 'mod+shift+]'],
      ['forward', 'Bring forward', 'mod+]'],
      ['backward', 'Send backward', 'mod+['],
      ['back', 'Send to back', 'mod+shift+['],
    ] as const
  ).map(
    ([dir, label, shortcut], i): Action => ({
      id: `object.arrange.${dir}`,
      label,
      menu: 'object',
      group: 'arrange',
      submenu: 'Arrange',
      section: 'Arrange',
      order: 10 + i,
      shortcut,
      enabled: hasSelection,
      run: () => ds().reorder(sel(), dir),
    }),
  ),
  {
    id: 'object.flipH',
    label: 'Flip horizontal',
    menu: 'object',
    group: 'transform',
    submenu: 'Transform',
    order: 20,
    shortcut: 'shift+h',
    enabled: hasSelection,
    run: () => flip('x'),
  },
  {
    id: 'object.flipV',
    label: 'Flip vertical',
    menu: 'object',
    group: 'transform',
    submenu: 'Transform',
    order: 21,
    shortcut: 'shift+v',
    enabled: hasSelection,
    run: () => flip('y'),
  },
  {
    id: 'object.lock',
    label: 'Lock',
    menu: 'object',
    group: 'state',
    order: 30,
    shortcut: 'mod+2',
    enabled: hasSelection,
    run: () => {
      ds().updateNodes(sel(), (n) => void (n.locked = true), { label: 'Lock' });
      ed().clearSelection();
    },
  },
  {
    id: 'object.reference',
    label: 'Use as reference',
    menu: 'object',
    group: 'state',
    order: 34,
    enabled: hasSelection,
    checked: () => sel().length > 0 && sel().every((id) => !!findNode(doc(), id)?.reference),
    run: () => setReference(!sel().every((id) => !!findNode(doc(), id)?.reference)),
  },
  {
    id: 'object.unlockAll',
    label: 'Unlock all',
    menu: 'object',
    group: 'state',
    order: 31,
    shortcut: 'mod+alt+2',
    run: () => {
      const ids: string[] = [];
      walk(doc().children, (n) => void (n.locked && ids.push(n.id)));
      ds().updateNodes(ids, (n) => void (n.locked = false), { label: 'Unlock all' });
      ed().setSelection(ids);
    },
  },
  {
    id: 'object.hide',
    label: 'Hide',
    menu: 'object',
    group: 'state',
    order: 32,
    shortcut: 'mod+3',
    enabled: hasSelection,
    run: () => {
      ds().updateNodes(sel(), (n) => void (n.visible = false), { label: 'Hide' });
      ed().clearSelection();
    },
  },
  {
    id: 'object.showAll',
    label: 'Show all',
    menu: 'object',
    group: 'state',
    order: 33,
    shortcut: 'mod+alt+3',
    run: () => {
      const ids: string[] = [];
      walk(doc().children, (n) => void (!n.visible && ids.push(n.id)));
      ds().updateNodes(ids, (n) => void (n.visible = true), { label: 'Show all' });
      ed().setSelection(ids);
    },
  },
];

export default actions;
