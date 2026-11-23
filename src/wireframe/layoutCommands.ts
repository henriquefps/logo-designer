// Stack / grid commands for the app (Object → Vertical stack / Horizontal stack / Grid / Remove
// stack, the Layout and Layout item properties sections). The document logic is in ./layoutEdit.ts.
import { findNode, topmostIds, type Id, type LayoutInfo, type LayoutItemInfo, type LayoutKind } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { canWrap, unwrapLayout, wrapInLayout } from './layoutEdit';

const LABEL: Record<LayoutKind, string> = { vstack: 'Vertical stack', hstack: 'Horizontal stack', grid: 'Grid' };

const selected = (): Id[] => {
  const { doc } = useDocStore.getState();
  return topmostIds(doc, useEditorStore.getState().selection);
};

/** True when the selection can become a stack: siblings in a wireframe, or one screen frame. */
export function canWrapSelection(): boolean {
  const { doc } = useDocStore.getState();
  const ids = selected();
  if (!doc.wireframe || !ids.length) return false;
  if (ids.length === 1) {
    const n = findNode(doc, ids[0]);
    if (n?.type === 'group' && n.screen) return true;
  }
  return canWrap(doc, ids);
}

/** Wraps the selection in a new stack / grid (a selected screen gets the layout itself) and selects it. */
export function wrapSelection(kind: LayoutKind): Id | null {
  if (!canWrapSelection()) return null;
  const ids = selected();
  let id: Id | null = null;
  useDocStore.getState().apply(
    (d) => {
      id = wrapInLayout(d, ids, kind);
    },
    { label: LABEL[kind] },
  );
  if (id) useEditorStore.getState().setSelection([id]);
  return id;
}

/** True when exactly one selected node lays out its children (a stack, a grid or a screen with a layout). */
export function canUnwrapSelection(): boolean {
  const { doc } = useDocStore.getState();
  const ids = selected();
  if (!doc.wireframe || ids.length !== 1) return false;
  const n = findNode(doc, ids[0]);
  return n?.type === 'group' && !!n.layout && !n.component;
}

/** Remove stack: the children take the container's place (a screen keeps them as free content). */
export function unwrapSelection(): void {
  if (!canUnwrapSelection()) return;
  const [id] = selected();
  let kids: Id[] | null = null;
  useDocStore.getState().apply(
    (d) => {
      kids = unwrapLayout(d, id);
    },
    { label: 'Remove stack' },
  );
  const n = findNode(useDocStore.getState().doc, id);
  if (kids && !n) useEditorStore.getState().setSelection(kids);
}

/** Edits the `layout` of containers (kind, gap, padding, align, columns). */
export function setLayout(ids: Id[], patch: Partial<LayoutInfo>, label = 'Layout') {
  useDocStore.getState().updateNodes(
    ids,
    (n) => {
      if (n.type !== 'group' || !n.layout) return;
      const next = { ...n.layout, ...patch };
      if (next.kind === 'grid') next.columns = Math.max(1, Math.round(next.columns ?? 2));
      else delete next.columns;
      if (next.justify === 'start' || next.kind === 'grid') delete next.justify;
      n.layout = next;
    },
    { label },
  );
}

/** Edits how children sit in their stack (`layoutItem`); `undefined` values go back to the default. */
export function setLayoutItem(ids: Id[], patch: Partial<Record<keyof LayoutItemInfo, LayoutItemInfo[keyof LayoutItemInfo] | undefined>>, label = 'Layout item') {
  useDocStore.getState().updateNodes(
    ids,
    (n) => {
      const next: Record<string, unknown> = { ...n.layoutItem };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || (k === 'position' && v === 'flow')) delete next[k];
        else next[k] = v;
      }
      if (Object.keys(next).length) n.layoutItem = next as LayoutItemInfo;
      else delete n.layoutItem;
    },
    { label },
  );
}
