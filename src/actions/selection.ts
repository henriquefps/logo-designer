import { applyWorldMatrix, findNode, parentWorldMatrix, topmostIds, translation, type Id, type Vec } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';

/** Helpers shared by action modules. */
export const sel = () => useEditorStore.getState().selection;
export const doc = () => useDocStore.getState().doc;
export const hasSelection = () => sel().length > 0;

/** Selected ids that still exist and aren't locked, without descendants of other selected nodes. */
export function editableSelection(): Id[] {
  const d = doc();
  return topmostIds(d, sel()).filter((id) => {
    const n = findNode(d, id);
    return n && !n.locked;
  });
}

/** Translates nodes by world-space deltas in one undo step. */
export function translateNodes(deltas: Map<Id, Vec>, label: string) {
  const d = doc();
  const nodes = [...deltas.entries()]
    .map(([id, v]) => {
      const n = findNode(d, id);
      return n ? applyWorldMatrix(n, parentWorldMatrix(d, id), translation(v.x, v.y)) : null;
    })
    .filter((n) => n !== null);
  if (nodes.length) useDocStore.getState().replaceNodes(nodes, { label });
}
