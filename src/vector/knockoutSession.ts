// Object → Knock out in the app: the topmost selected object cuts the others. The result is shown
// at once (default gap) inside one open transaction; the Knockout panel on the canvas changes the
// gap with a live preview, then Apply commits one undo step (Cancel / Escape restores).
import { create } from 'zustand';
import { toast } from 'sonner';
import { findNode, sortByDocumentOrder, topmostIds, type DesignDocument, type Id, type SceneNode } from '@/model';
import { textToPaths } from '@/fonts/outline';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { isBooleanOperand } from './convert';
import { applyKnockout, defaultKnockoutGap, gapUnit, knockout } from './knockout';
import { loadPaper } from './paperOps';

export const KNOCKOUT_LABEL = 'Knock out';

interface Session {
  base: DesignDocument;
  cutter: Id;
  targets: Id[];
  resolved: Map<Id, SceneNode>;
  scope: paper.PaperScope;
  /** The doc store transaction this session owns. */
  txn: unknown;
}

interface KnockoutState {
  open: boolean;
  /** Gap in document units. */
  gap: number;
  /** Targets cut by the current gap. */
  changed: number;
  /** Cut only under the cutter's strokes/fills, not inside its unfilled closed shapes. */
  outlineOnly: boolean;
  set: (s: Partial<Omit<KnockoutState, 'set'>>) => void;
}

export const useKnockout = create<KnockoutState>((set) => ({ open: false, gap: 4, changed: 0, outlineOnly: false, set: (s) => set(s) }));

let session: Session | null = null;
/** Last gap used, per unit ('T' fraction or px), so the next knockout starts from it. */
const lastGap = new Map<string, number>();

const ds = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

const containsText = (n: SceneNode): boolean => (n.type === 'group' ? n.children.some(containsText) : n.type === 'text');
const isOperand = (n: SceneNode) => isBooleanOperand(n) || containsText(n);

async function outlineTexts(n: SceneNode): Promise<SceneNode> {
  if (n.type === 'text') return n.visible ? { ...(await textToPaths(n)), id: n.id } : n;
  if (n.type !== 'group' || !containsText(n)) return n;
  return { ...n, children: await Promise.all(n.children.map(outlineTexts)) };
}

/** Selected, unlocked, topmost operands in paint order (bottom first). */
function operands(doc: DesignDocument): Id[] {
  return sortByDocumentOrder(doc, topmostIds(doc, ed().selection)).filter((id) => {
    const n = findNode(doc, id);
    return !!n && !n.locked && isOperand(n);
  });
}

export const canKnockout = () => !useKnockout.getState().open && operands(ds().doc).length >= 2;

/** Computes the knockout for `gap` from the session snapshot and shows it (inside the transaction). */
function preview(gap: number) {
  if (!session) return;
  const { outlineOnly } = useKnockout.getState();
  let r;
  try {
    r = knockout(session.scope, session.base, { cutters: [session.cutter], targets: session.targets, gap, outlineOnly, resolved: session.resolved });
  } catch (err) {
    console.error(err);
    toast.error('Knock out failed on this geometry');
    return;
  }
  const next = applyKnockout(session.base, r);
  ds().apply((d) => {
    d.children = next.children as typeof d.children;
  });
  useKnockout.getState().set({ gap, changed: r.replace.length + r.remove.length });
  if (r.remove.length) ed().setSelection(ed().selection.filter((id) => !r.remove.includes(id)));
}

/** Object → Knock out: starts a session with the default (or last) gap. */
export async function startKnockout(): Promise<void> {
  if (useKnockout.getState().open) return;
  const doc = ds().doc;
  const ids = operands(doc);
  if (ids.length < 2) {
    toast('Select two or more objects: the top one cuts the others.');
    return;
  }
  const cutter = ids[ids.length - 1];
  const targets = ids.slice(0, -1);
  let resolvedNodes: SceneNode[];
  try {
    resolvedNodes = await Promise.all(ids.map((id) => outlineTexts(findNode(doc, id)!)));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not outline the text.');
    return;
  }
  const scope = await loadPaper();
  if (ds().doc !== doc) return; // the document changed while fonts / paper.js were loading
  const resolved = new Map<Id, SceneNode>();
  ids.forEach((id, i) => resolvedNodes[i] !== findNode(doc, id) && resolved.set(id, resolvedNodes[i]));
  const unit = gapUnit(doc);
  const remembered = lastGap.get(unit.label);
  const gap = remembered !== undefined ? unit.toDoc(remembered) : defaultKnockoutGap(doc);
  ds().beginTransaction(KNOCKOUT_LABEL);
  session = { base: doc, cutter, targets, resolved, scope, txn: ds().txn };
  useKnockout.getState().set({ open: true });
  preview(gap);
  if (!useKnockout.getState().changed) {
    toast('Knock out: the top object does not touch the others.');
  }
}

/** Live preview: cut inside the cutter's closed shapes too (false) or only under its outline. */
export function setKnockoutOutlineOnly(outlineOnly: boolean) {
  if (!session) return;
  useKnockout.getState().set({ outlineOnly });
  preview(useKnockout.getState().gap);
}

/** Live preview for a new gap (document units). */
export function setKnockoutGap(gap: number) {
  if (!session || !(gap >= 0)) return;
  preview(gap);
}

function close() {
  session = null;
  useKnockout.getState().set({ open: false });
}

/** Apply: one undo step. */
export function commitKnockout() {
  if (!session) return;
  const { gap } = useKnockout.getState();
  lastGap.set(gapUnit(session.base).label, gapUnit(session.base).fromDoc(gap));
  const owned = ds().txn === session.txn;
  close();
  if (owned) ds().commitTransaction();
}

/** Cancel: restores the document as it was before Knock out. */
export function cancelKnockout() {
  if (!session) return;
  const owned = ds().txn === session.txn;
  const selection = ed().selection;
  close();
  if (owned) {
    ds().cancelTransaction();
    ed().setSelection(selection);
  }
}

/** The transaction was committed by something else (another gesture, undo): the session ends as applied. */
export function knockoutTxnLost() {
  if (session && ds().txn !== session.txn) close();
}
