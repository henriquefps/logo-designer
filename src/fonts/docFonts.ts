import { walk, type DesignDocument, type SceneNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { canonicalFamily } from './catalog';

/** Font families used by text nodes in a document (canonical names). */
export function documentFamilies(doc: DesignDocument): string[] {
  const set = new Set<string>();
  walk(doc.children, (n) => void (n.type === 'text' && set.add(n.fontFamily)));
  return [...set];
}

const sameFamily = (a: string, b: string) => canonicalFamily(a).toLowerCase() === canonicalFamily(b).toLowerCase();

/** Ids of text nodes using `family`. */
export function textsUsing(doc: DesignDocument, family: string): string[] {
  const ids: string[] = [];
  walk(doc.children, (n) => void (n.type === 'text' && sameFamily(n.fontFamily, family) && ids.push(n.id)));
  return ids;
}

/** Points every text using `from` at `to` (one undo step). Returns how many texts changed. */
export function replaceFamilyInDocument(from: string, to: string, label = 'Replace font'): number {
  const ds = useDocStore.getState();
  const ids = textsUsing(ds.doc, from);
  if (ids.length) ds.updateNodes(ids, (n) => void (n.type === 'text' && ((n as SceneNode & { fontFamily: string }).fontFamily = to)), { label });
  return ids.length;
}
