import { create } from 'zustand';
import { createText, findNode, solid, type Id, type TextNode, type Vec } from '@/model';
import { baselineOffset, resolveText } from '@/fonts';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { switchTool } from '../context';

/** Style for new text (the text tool's options bar edits it). */
export interface TextDefaults {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  set: (patch: Partial<Omit<TextDefaults, 'set'>>) => void;
}

export const useTextDefaults = create<TextDefaults>()((set) => ({
  fontFamily: 'Inter',
  fontWeight: 400,
  fontSize: 48,
  set: (patch) => set(patch),
}));

/**
 * In-place text editing session. Typing updates the node live inside one doc transaction, so a
 * whole edit (or a new text) is one undo step. Committing an empty text removes it.
 */
interface Session {
  id: Id;
  isNew: boolean;
  original: string;
  /** Tool to go back to when done (e.g. 'select' after a double-click edit). */
  returnTool: string | null;
  txn: unknown;
}

let session: Session | null = null;

const ds = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

export const isEditingText = () => session !== null;
export const editingSession = () => session;

function openTxn(label: string) {
  ds().beginTransaction(label);
  return ds().txn;
}

/** Starts editing an existing text node. */
export function beginTextEdit(id: Id, returnTool: string | null = null) {
  if (session) commitTextEdit();
  const node = findNode(ds().doc, id);
  if (!node || node.type !== 'text' || node.locked) return false;
  session = { id, isNew: false, original: node.text, returnTool, txn: openTxn('Edit text') };
  ed().setSelection([id]);
  ed().setEditingText(id);
  return true;
}

/** Creates an empty text whose first baseline sits at `point` and starts editing it. */
export function createTextAt(point: Vec) {
  if (session) commitTextEdit();
  const d = useTextDefaults.getState();
  const style = { fontFamily: d.fontFamily, fontWeight: d.fontWeight, fontStyle: 'normal' as const };
  const metrics = resolveText(style).face.metrics;
  const lineHeight = 1.2;
  const node = createText({
    ...style,
    text: '',
    fontSize: d.fontSize,
    lineHeight,
    fill: solid('#000000'),
    transform: { x: point.x, y: point.y - baselineOffset(metrics, d.fontSize, lineHeight) },
  });
  const txn = openTxn('Add text');
  ds().addNodes([node]);
  session = { id: node.id, isNew: true, original: '', returnTool: null, txn };
  ed().setSelection([node.id]);
  ed().setEditingText(node.id);
  return node.id;
}

/** Live text update from the editor. */
export function setEditingText(text: string) {
  if (!session) return;
  const node = findNode(ds().doc, session.id);
  if (!node || node.type !== 'text' || node.text === text) return;
  // Another gesture (e.g. scrubbing a field) may have closed our transaction: open a new one.
  if (ds().txn !== session.txn) session.txn = openTxn('Edit text');
  ds().replaceNodes([{ ...node, text } satisfies TextNode]);
}

/** Ends editing: keeps the text (one undo step), or removes it when empty. */
export function commitTextEdit() {
  const s = session;
  if (!s) return;
  session = null;
  ed().setEditingText(null);
  const ownsTxn = ds().txn !== null && ds().txn === s.txn;
  const node = findNode(ds().doc, s.id);
  const empty = !node || (node.type === 'text' && !node.text.trim());
  if (empty) {
    if (s.isNew && ownsTxn) ds().cancelTransaction();
    else {
      if (node) ds().deleteNodes([s.id]);
      if (ownsTxn) ds().commitTransaction();
    }
    ed().setSelection(ed().selection.filter((x) => x !== s.id));
  } else if (ownsTxn) {
    ds().commitTransaction();
  }
  if (s.returnTool) switchTool(s.returnTool);
}

let lastDown: { t: number; x: number; y: number } | null = null;
/** Double-click detection from pointerdowns (screen px), independent of PointerEvent.detail support. */
export function isDoubleClick(e: { screen: Vec; detail: number }): boolean {
  const now = performance.now();
  // Browsers that report click counts: exactly 2 (a fast click after a double-click is 3, not a new double-click).
  const dbl = e.detail
    ? e.detail === 2
    : !!lastDown && now - lastDown.t < 450 && Math.hypot(e.screen.x - lastDown.x, e.screen.y - lastDown.y) < 5;
  lastDown = dbl ? null : { t: now, x: e.screen.x, y: e.screen.y };
  return dbl;
}

/** Select tool double-click: edit a text node in place. Returns true when handled. */
export function editTextOnDoubleClick(id: Id | null): boolean {
  if (!id) return false;
  const node = findNode(ds().doc, id);
  if (!node || node.type !== 'text' || node.locked) return false;
  const from = ed().tool;
  switchTool('text');
  return beginTextEdit(id, from);
}
