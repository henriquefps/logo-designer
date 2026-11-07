import type { DesignDocument, GroupNode, Id, SceneNode } from './types';

export type Container = DesignDocument | GroupNode;

export interface Located {
  node: SceneNode;
  parent: Container;
  index: number;
  /** Ancestor groups from the root down to the direct parent (excluding the node). */
  ancestors: GroupNode[];
}

/** Depth-first walk (document order, parents before children). Return false to skip children. */
export function walk(
  nodes: SceneNode[],
  visit: (node: SceneNode, ancestors: GroupNode[]) => boolean | void,
  ancestors: GroupNode[] = [],
): void {
  for (const node of nodes) {
    const res = visit(node, ancestors);
    if (res !== false && node.type === 'group') walk(node.children, visit, [...ancestors, node]);
  }
}

export function locate(doc: DesignDocument, id: Id): Located | null {
  const search = (parent: Container, ancestors: GroupNode[]): Located | null => {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i];
      if (node.id === id) return { node, parent, index: i, ancestors };
      if (node.type === 'group') {
        const found = search(node, [...ancestors, node]);
        if (found) return found;
      }
    }
    return null;
  };
  return search(doc, []);
}

export const findNode = (doc: DesignDocument, id: Id): SceneNode | null => locate(doc, id)?.node ?? null;

/** Parent group, or null when the node is at the document root (or missing). */
export function getParent(doc: DesignDocument, id: Id): GroupNode | null {
  const loc = locate(doc, id);
  return loc && loc.parent !== doc ? (loc.parent as GroupNode) : null;
}

export function getContainer(doc: DesignDocument, parentId: Id | null): Container | null {
  if (parentId === null) return doc;
  const n = findNode(doc, parentId);
  return n && n.type === 'group' ? n : null;
}

/** True when `ancestorId` is `id` itself or one of its ancestors. */
export function isAncestorOrSelf(doc: DesignDocument, ancestorId: Id, id: Id): boolean {
  if (ancestorId === id) return true;
  const loc = locate(doc, id);
  return !!loc?.ancestors.some((a) => a.id === ancestorId);
}

/** Removes ids whose ancestor is also in the list (so a group and its child aren't both processed). */
export function topmostIds(doc: DesignDocument, ids: Id[]): Id[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    const loc = locate(doc, id);
    return loc && !loc.ancestors.some((a) => set.has(a.id));
  });
}

/** Ids sorted in document (paint) order, bottom-most first. */
export function sortByDocumentOrder(doc: DesignDocument, ids: Id[]): Id[] {
  const order = new Map<Id, number>();
  let i = 0;
  walk(doc.children, (n) => {
    order.set(n.id, i++);
  });
  return [...ids].filter((id) => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!);
}

/** All node ids in the subtree (including the root). */
export function subtreeIds(node: SceneNode): Id[] {
  const ids = [node.id];
  if (node.type === 'group') walk(node.children, (n) => void ids.push(n.id));
  return ids;
}

/** Finds the root-level ancestor (or the node itself when at root). */
export function rootAncestor(doc: DesignDocument, id: Id): SceneNode | null {
  const loc = locate(doc, id);
  if (!loc) return null;
  return loc.ancestors[0] ?? loc.node;
}
