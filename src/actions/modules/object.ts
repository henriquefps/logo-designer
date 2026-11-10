import { toast } from 'sonner';
import { allReferences, applyReference, applyWorldMatrix, findNode, parentWorldMatrix, rectCenter, scaleAbout, selectionBounds, walk } from '@/model';
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

/** Marks nodes as tracing references (locked, not selectable on canvas, not exported) or restores them. */
export function setReference(on: boolean, ids: string[] = sel()) {
  ds().updateNodes(ids, (n) => void ((on || n.reference) && applyReference(n, on)), { label: on ? 'Use as reference' : 'Stop using as reference' });
  if (on) {
    ed().clearSelection();
    toast(ids.length === 1 ? 'Marked as reference' : `${ids.length} objects marked as reference`, {
      description: 'Reference layers cannot be selected on the canvas and are not exported. Select one in Layers to stop using it as reference.',
      action: { label: 'Undo', onClick: () => useDocStore.getState().undo() },
    });
  } else {
    ed().setSelection(ids);
  }
}

/** Turns every reference in the document back into a normal, editable object. */
export function stopAllReferences() {
  const ids = allReferences(doc()).map((n) => n.id);
  if (ids.length) setReference(false, ids);
  return ids;
}

/** Mixed selections count as reference, so the toggle turns references off rather than marking everything. */
const anySelectedReference = () => sel().some((id) => !!findNode(doc(), id)?.reference);

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
    checked: () => anySelectedReference(),
    run: () => setReference(!anySelectedReference()),
  },
  {
    id: 'object.unlockAll',
    label: 'Unlock all',
    menu: 'object',
    group: 'state',
    order: 31,
    shortcut: 'mod+alt+2',
    run: () => {
      // Unlocks locked layers and turns non-image references (shapes/text that were never meant as
      // tracing layers) back into normal objects. Reference *images* stay reference: use
      // "Stop all references" for those.
      const ids: string[] = [];
      let refs = 0;
      walk(doc().children, (n) => {
        if (n.reference && n.type === 'image') return;
        if (n.reference) refs++;
        if (n.locked || n.reference) ids.push(n.id);
      });
      ds().updateNodes(ids, (n) => applyReference(n, false), { label: 'Unlock all' });
      ed().setSelection(ids);
      if (refs) toast(`${refs} reference object${refs === 1 ? ' is' : 's are'} now editable`, { description: 'They are included in exports again.' });
    },
  },
  {
    id: 'object.stopReferences',
    label: 'Stop all references',
    menu: 'object',
    group: 'state',
    order: 35,
    enabled: () => allReferences(doc()).length > 0,
    run: () => void stopAllReferences(),
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
