import { toast } from 'sonner';
import { findNode, topmostIds, walk, type Id, type SceneNode, type TextNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { textToPaths } from './outline';

/** Text nodes in the selection (including texts inside selected groups), unlocked. */
export function selectedTexts(): TextNode[] {
  const doc = useDocStore.getState().doc;
  const out: TextNode[] = [];
  for (const id of topmostIds(doc, useEditorStore.getState().selection)) {
    const n = findNode(doc, id);
    if (!n || n.locked) continue;
    walk([n], (c) => void (c.type === 'text' && !c.locked && out.push(c)));
  }
  return out;
}

export const hasSelectedText = () => selectedTexts().length > 0;

function replaceInTree(nodes: SceneNode[], id: Id, next: SceneNode): boolean {
  const i = nodes.findIndex((n) => n.id === id);
  if (i >= 0) {
    nodes[i] = next;
    return true;
  }
  return nodes.some((n) => n.type === 'group' && replaceInTree(n.children, id, next));
}

/** Text → Create outlines: replaces each selected text with a group of glyph paths (one undo step). */
export async function outlineSelection() {
  const texts = selectedTexts();
  if (!texts.length) return;
  let results: { id: Id; group: SceneNode }[];
  try {
    results = await Promise.all(texts.map(async (t) => ({ id: t.id, group: await textToPaths(t) })));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not create outlines.');
    return;
  }
  const ds = useDocStore.getState();
  ds.apply(
    (d) => {
      for (const r of results) replaceInTree(d.children as SceneNode[], r.id, r.group);
    },
    { label: 'Create outlines' },
  );
  const ed = useEditorStore.getState();
  const replaced = new Map(results.map((r) => [r.id, r.group.id]));
  ed.setSelection(ed.selection.map((id) => replaced.get(id) ?? id));
}
