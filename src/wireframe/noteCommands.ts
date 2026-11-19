// Note commands for the app (Note tool, Add note, attach / detach). The document logic is in
// ./notes.ts (shared with the CLI and the tests); this file adds the stores.
import type { Id } from '@/model';
import { findNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { addNote, attachNote, canAttach, detachNote, isNoteNode, type NoteNode } from './notes';

/** The selected note (exactly one selected object, a note), or null. */
export function selectedNote(): NoteNode | null {
  const { doc } = useDocStore.getState();
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const n = doc.children.find((c) => c.id === sel[0]);
  return n && isNoteNode(n) ? n : null;
}

/** The one selected node a note can be attached to (not a note), or null. */
export function selectedNoteTarget(): Id | null {
  const { doc } = useDocStore.getState();
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const n = findNode(doc, sel[0]);
  return n && !(n.type === 'group' && n.note) ? n.id : null;
}

/** Adds a note, free (at `at`) or attached to `target` (placed next to it), and selects it. */
export function addNoteCommand(o: { target?: Id; at?: { x: number; y: number }; text?: string } = {}): Id | null {
  if (!useDocStore.getState().doc.wireframe) return null;
  const target = o.target && canAttach(useDocStore.getState().doc, '', o.target) ? o.target : undefined;
  let id: Id | null = null;
  useDocStore.getState().apply(
    (d) => {
      id = addNote(d, { text: o.text, target, ...(o.at && !target ? { x: Math.round(o.at.x), y: Math.round(o.at.y) } : {}) });
    },
    { label: target ? 'Add attached note' : 'Add note' },
  );
  if (id) useEditorStore.getState().setSelection([id]);
  return id;
}

export const addNoteToSelection = () => {
  const target = selectedNoteTarget();
  return target ? addNoteCommand({ target }) : null;
};

export function setNoteText(noteId: Id, text: string) {
  useDocStore.getState().updateNodes(
    [noteId],
    (n) => {
      if (n.type === 'group' && n.note && n.note.text !== text) n.note.text = text;
    },
    { label: 'Edit note' },
  );
}

export function attachNoteTo(noteId: Id, targetId: Id) {
  useDocStore.getState().apply((d) => void attachNote(d, noteId, targetId), { label: 'Attach note' });
}

export function detachNoteCommand(noteId: Id) {
  useDocStore.getState().apply((d) => void detachNote(d, noteId), { label: 'Detach note' });
}
