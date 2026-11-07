import type { Draft } from 'immer';
import { applyWorldMatrix, findNode, parentWorldMatrix, type Id, type Matrix, type SceneNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';

/** Mutates the given nodes in one undo step (or inside the open transaction). */
export function editNodes(ids: Id[], recipe: (n: Draft<SceneNode>) => void, label: string) {
  useDocStore.getState().updateNodes(ids, recipe, { label });
}

/** Applies a world-space matrix to the nodes (move/resize/rotate/flip from the panel). */
export function transformNodes(ids: Id[], m: Matrix, label: string) {
  const store = useDocStore.getState();
  const doc = store.doc;
  const nodes = ids.map((id) => findNode(doc, id)).filter((n): n is SceneNode => !!n && !n.locked);
  store.replaceNodes(
    nodes.map((n) => applyWorldMatrix(n, parentWorldMatrix(doc, n.id), m)),
    { label },
  );
}

/** Same value across all items, or null when mixed. */
export function common<T, V>(items: T[], get: (t: T) => V): V | null {
  if (!items.length) return null;
  const first = get(items[0]);
  return items.every((i) => get(i) === first) ? first : null;
}
