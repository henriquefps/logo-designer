import { applyPatches, enablePatches, produce, produceWithPatches, type Draft, type Patch } from 'immer';
import { create } from 'zustand';
import { useEditorStore } from './useEditorStore';
import {
  cloneWithNewIds,
  createDocument,
  createGroup,
  findNode,
  fromTransform,
  getContainer,
  getParent,
  locate,
  multiply,
  invert,
  parentWorldMatrix,
  sortByDocumentOrder,
  toTransform,
  topmostIds,
  type Artboard,
  type DesignDocument,
  type GroupNode,
  type Id,
  type SceneNode,
  type Transform,
  type WireframeFlow,
} from '@/model';
import { attachFlows, copyFlows, copyIdMap, flowsOf, screenIdsOf } from '@/wireframe/flows';
import { runWireframePipeline } from '@/wireframe/pipeline';

enablePatches();

export const HISTORY_LIMIT = 100;

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  /** Selection when the change was made (restored by undo). */
  selection?: Id[];
  /** Selection when the entry was undone (restored by redo). */
  redoSelection?: Id[];
}

interface Transaction {
  label: string;
  base: DesignDocument;
  selection: Id[];
}

const currentSelection = () => useEditorStore.getState().selection;
const restoreSelection = (ids: Id[] | undefined) => {
  if (ids) useEditorStore.getState().setSelection(ids);
};

export type NodePatch = Partial<Omit<SceneNode, 'id' | 'type' | 'transform' | 'children'>> & {
  transform?: Partial<Transform>;
} & Record<string, unknown>;

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export interface DocState {
  doc: DesignDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  txn: Transaction | null;
  /** Increments on every document change (cheap change detection for autosave). */
  version: number;

  /** Applies an immer recipe to the document, recording one undo step (or folding into the open transaction). */
  apply: (recipe: (draft: Draft<DesignDocument>) => void, opts?: { label?: string }) => void;
  beginTransaction: (label: string) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Replaces the document and clears history (open project). */
  load: (doc: DesignDocument) => void;

  /** `flows`: copied flows (new ids) to add with the nodes; those whose target screen does not exist are dropped. */
  addNodes: (nodes: SceneNode[], opts?: { parentId?: Id | null; index?: number; label?: string; flows?: WireframeFlow[] }) => Id[];
  updateNode: (id: Id, patch: NodePatch, opts?: { label?: string }) => void;
  updateNodes: (ids: Id[], recipe: (node: Draft<SceneNode>) => void, opts?: { label?: string }) => void;
  /** Replaces whole nodes by id (used by transform gestures computing from a snapshot). */
  replaceNodes: (nodes: SceneNode[], opts?: { label?: string }) => void;
  deleteNodes: (ids: Id[]) => void;
  reorder: (ids: Id[], direction: ReorderDirection) => void;
  /** Moves nodes into `parentId` (null = root) at `index` (in the target's children, before removal). */
  moveNodes: (ids: Id[], parentId: Id | null, index: number) => void;
  group: (ids: Id[]) => Id | null;
  ungroup: (ids: Id[]) => Id[];
  setArtboard: (patch: Partial<Artboard>, opts?: { label?: string }) => void;
  rename: (name: string) => void;
  duplicate: (ids: Id[], offset?: number) => Id[];

  findNode: (id: Id) => SceneNode | null;
  getParent: (id: Id) => GroupNode | null;
}

/** Index path of a node in a plain document (null = missing). Cheap, unlike walking an immer draft. */
function indexPath(nodes: readonly SceneNode[], id: Id): number[] | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return [i];
    if (n.type === 'group') {
      const sub = indexPath(n.children, id);
      if (sub) return [i, ...sub];
    }
  }
  return null;
}

/**
 * The draft node with `id` and where it sits: found on the plain `base` document, then reached in the
 * draft by index (walking a draft creates a proxy for every node it visits, which costs milliseconds per
 * drag frame in a large wireframe). Falls back to a draft walk when the recipe already moved things.
 */
function locateDraft(d: Draft<DesignDocument>, base: DesignDocument, id: Id): { node: Draft<SceneNode>; list: Draft<SceneNode>[]; index: number } | null {
  const path = indexPath(base.children, id);
  if (path) {
    let list = d.children as Draft<SceneNode>[];
    for (let k = 0; k < path.length; k++) {
      const node = list[path[k]];
      if (!node) break;
      if (k === path.length - 1) {
        if (node.id === id) return { node, list, index: path[k] };
        break;
      }
      if (node.type !== 'group') break;
      list = node.children as Draft<SceneNode>[];
    }
  }
  const loc = locate(d as DesignDocument, id);
  return loc ? { node: loc.node as Draft<SceneNode>, list: loc.parent.children as Draft<SceneNode>[], index: loc.index } : null;
}

function trim(stack: HistoryEntry[]) {
  return stack.length > HISTORY_LIMIT ? stack.slice(stack.length - HISTORY_LIMIT) : stack;
}

/** Removes nodes by id anywhere in the tree; returns removed nodes in document order. */
function removeFromTree(draft: Draft<DesignDocument>, ids: Id[]): SceneNode[] {
  const removed: SceneNode[] = [];
  const set = new Set(ids);
  const visit = (container: { children: Draft<SceneNode>[] }) => {
    container.children = container.children.filter((c) => {
      if (set.has(c.id)) {
        removed.push(c as SceneNode);
        return false;
      }
      if (c.type === 'group') visit(c);
      return true;
    });
  };
  visit(draft);
  return removed;
}

export const useDocStore = create<DocState>()((set, get) => {
  const commitEntry = (next: DesignDocument, patches: Patch[], inverse: Patch[], label: string) => {
    if (!patches.length) return;
    set((s) => ({
      doc: next,
      past: trim([...s.past, { label, patches, inverse, selection: currentSelection() }]),
      future: [],
      version: s.version + 1,
    }));
  };

  // Wireframe documents: after every change the materialization pipeline (src/wireframe/pipeline.ts)
  // updates generated content inside the same undo step. Other documents return null right away.
  const apply: DocState['apply'] = (recipe, opts) => {
    const { doc, txn } = get();
    if (txn) {
      let next = produce(doc, recipe);
      if (next === doc) return;
      next = runWireframePipeline(next, doc, 'change', { patches: false, gestureStart: txn.base })?.doc ?? next;
      set((s) => ({ doc: next, version: s.version + 1 }));
      return;
    }
    const [next, patches, inverse] = produceWithPatches(doc, recipe);
    if (!patches.length) return;
    const m = runWireframePipeline(next, doc, 'settle');
    if (m) commitEntry(m.doc, [...patches, ...m.patches], [...m.inverse, ...inverse], opts?.label ?? 'Edit');
    else commitEntry(next, patches, inverse, opts?.label ?? 'Edit');
  };

  return {
    doc: createDocument(),
    past: [],
    future: [],
    txn: null,
    version: 0,

    apply,

    beginTransaction: (label) => {
      if (get().txn) get().commitTransaction();
      set({ txn: { label, base: get().doc, selection: currentSelection() } });
    },
    commitTransaction: () => {
      const { txn } = get();
      if (!txn) return;
      let doc = get().doc;
      if (doc !== txn.base) {
        const settled = runWireframePipeline(doc, txn.base, 'settle', { patches: false });
        if (settled) {
          doc = settled.doc;
          set((s) => ({ doc, version: s.version + 1 }));
        }
      }
      set({ txn: null });
      if (doc === txn.base) return;
      // One undo step: diff the top-level keys against the snapshot taken at begin.
      const [, patches, inverse] = produceWithPatches(txn.base, (d) => {
        for (const key of Object.keys(doc) as (keyof DesignDocument)[]) {
          if (doc[key] !== txn.base[key]) (d as Record<string, unknown>)[key] = doc[key];
        }
      });
      set((s) => ({ past: trim([...s.past, { label: txn.label, patches, inverse, selection: txn.selection }]), future: [] }));
    },
    cancelTransaction: () => {
      const { txn } = get();
      if (!txn) return;
      set((s) => ({ doc: txn.base, txn: null, version: s.version + 1 }));
    },

    undo: () => {
      if (get().txn) get().commitTransaction();
      const { past, doc } = get();
      const entry = past[past.length - 1];
      if (!entry) return;
      set((s) => ({
        doc: applyPatches(doc, entry.inverse),
        past: past.slice(0, -1),
        future: [...s.future, { ...entry, redoSelection: currentSelection() }],
        version: s.version + 1,
      }));
      restoreSelection(entry.selection);
    },
    redo: () => {
      const { future, doc } = get();
      const entry = future[future.length - 1];
      if (!entry) return;
      set((s) => ({
        doc: applyPatches(doc, entry.patches),
        future: future.slice(0, -1),
        past: [...s.past, entry],
        version: s.version + 1,
      }));
      restoreSelection(entry.redoSelection);
    },
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    load: (doc) => {
      const ready = runWireframePipeline(doc, null, 'load', { patches: false })?.doc ?? doc;
      set((s) => ({ doc: ready, past: [], future: [], txn: null, version: s.version + 1 }));
    },

    addNodes: (nodes, opts = {}) => {
      apply(
        (d) => {
          const container = getContainer(d as DesignDocument, opts.parentId ?? null) ?? d;
          const index = opts.index ?? container.children.length;
          (container.children as SceneNode[]).splice(index, 0, ...nodes);
          if (opts.flows?.length) attachFlows(d, opts.flows, screenIdsOf(nodes));
        },
        { label: opts.label ?? (nodes.length === 1 ? `Add ${nodes[0].name}` : 'Add objects') },
      );
      return nodes.map((n) => n.id);
    },

    updateNode: (id, patch, opts) => {
      const base = get().doc;
      apply(
        (d) => {
          const node = locateDraft(d, base, id)?.node;
          if (!node) return;
          const { transform, ...rest } = patch;
          Object.assign(node, rest);
          if (transform) Object.assign(node.transform, transform);
        },
        { label: opts?.label ?? 'Change' },
      );
    },

    updateNodes: (ids, recipe, opts) => {
      const base = get().doc;
      apply(
        (d) => {
          for (const id of ids) {
            const node = locateDraft(d, base, id)?.node;
            if (node) recipe(node);
          }
        },
        { label: opts?.label ?? 'Change' },
      );
    },

    replaceNodes: (nodes, opts) => {
      const base = get().doc;
      apply(
        (d) => {
          for (const n of nodes) {
            const loc = locateDraft(d, base, n.id);
            if (loc) (loc.list as SceneNode[])[loc.index] = n;
          }
        },
        { label: opts?.label ?? 'Transform' },
      );
    },

    deleteNodes: (ids) => {
      if (!ids.length) return;
      apply((d) => void removeFromTree(d, ids), { label: ids.length === 1 ? 'Delete' : 'Delete objects' });
    },

    reorder: (ids, direction) => {
      apply(
        (d) => {
          const doc = d as DesignDocument;
          // Group ids by parent so each sibling list is reordered independently.
          const byParent = new Map<object, { children: SceneNode[]; indexes: number[] }>();
          for (const id of ids) {
            const loc = locate(doc, id);
            if (!loc) continue;
            const entry = byParent.get(loc.parent) ?? { children: loc.parent.children, indexes: [] };
            entry.indexes.push(loc.index);
            byParent.set(loc.parent, entry);
          }
          for (const { children, indexes } of byParent.values()) {
            const sel = new Set(indexes);
            const picked = children.filter((_, i) => sel.has(i));
            const rest = children.filter((_, i) => !sel.has(i));
            let result: SceneNode[];
            if (direction === 'front') result = [...rest, ...picked];
            else if (direction === 'back') result = [...picked, ...rest];
            else {
              result = [...children];
              const order = [...indexes].sort((a, b) => (direction === 'forward' ? b - a : a - b));
              for (const i of order) {
                const j = direction === 'forward' ? i + 1 : i - 1;
                if (j < 0 || j >= result.length || sel.has(j)) continue;
                [result[i], result[j]] = [result[j], result[i]];
                sel.delete(i);
                sel.add(j);
              }
            }
            children.splice(0, children.length, ...result);
          }
        },
        { label: direction === 'front' ? 'Bring to front' : direction === 'back' ? 'Send to back' : 'Reorder' },
      );
    },

    moveNodes: (ids, parentId, index) => {
      const doc = get().doc;
      // Never move a node into itself or its own descendants.
      const valid = topmostIds(doc, ids).filter((id) => {
        if (parentId === null) return true;
        const target = locate(doc, parentId);
        return id !== parentId && !target?.ancestors.some((a) => a.id === id);
      });
      if (!valid.length) return;
      const target = getContainer(doc, parentId);
      if (!target) return;
      const ordered = sortByDocumentOrder(doc, valid);
      const targetWorld = parentId === null ? null : multiply(parentWorldMatrix(doc, parentId), fromTransform(findNode(doc, parentId)!.transform));
      // Count removed nodes that sit before `index` in the target so the insertion point stays put.
      const before = target.children.slice(0, index).filter((c) => ordered.includes(c.id)).length;
      apply(
        (d) => {
          const draftDoc = d as DesignDocument;
          const moved = ordered.map((id) => {
            const node = findNode(doc, id)!;
            const from = parentWorldMatrix(doc, id);
            const to = targetWorld ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            // Keep the visual placement when changing parents.
            const sameParent = (getParent(doc, id)?.id ?? null) === parentId;
            if (sameParent) return node;
            const t = toTransform(multiply(invert(to), multiply(from, fromTransform(node.transform))));
            return { ...node, transform: t } as SceneNode;
          });
          removeFromTree(d, ordered);
          const container = getContainer(draftDoc, parentId)!;
          (container.children as SceneNode[]).splice(Math.max(0, index - before), 0, ...moved);
        },
        { label: 'Move in layers' },
      );
    },

    group: (ids) => {
      const doc = get().doc;
      const ordered = sortByDocumentOrder(doc, topmostIds(doc, ids));
      if (!ordered.length) return null;
      const topId = ordered[ordered.length - 1];
      const topLoc = locate(doc, topId)!;
      const parentId = topLoc.parent === doc ? null : (topLoc.parent as GroupNode).id;
      const group = createGroup({ name: 'Group' });
      const set = new Set(ordered);
      // Insert where the topmost selected node is, accounting for removed siblings below it.
      const index = topLoc.parent.children.slice(0, topLoc.index + 1).filter((c) => !set.has(c.id)).length;
      apply(
        (d) => {
          const draftDoc = d as DesignDocument;
          const targetWorld = parentWorldMatrix(doc, topId);
          group.children = ordered.map((id) => {
            const node = findNode(doc, id)!;
            const from = parentWorldMatrix(doc, id);
            if ((getParent(doc, id)?.id ?? null) === parentId) return node;
            const t = toTransform(multiply(invert(targetWorld), multiply(from, fromTransform(node.transform))));
            return { ...node, transform: t } as SceneNode;
          });
          removeFromTree(d, ordered);
          const container = getContainer(draftDoc, parentId)!;
          (container.children as SceneNode[]).splice(index, 0, group);
        },
        { label: 'Group' },
      );
      return group.id;
    },

    ungroup: (ids) => {
      const doc = get().doc;
      const groups = ids.map((id) => findNode(doc, id)).filter((n): n is GroupNode => n?.type === 'group');
      if (!groups.length) return [];
      const released: Id[] = [];
      apply(
        (d) => {
          for (const g of groups) {
            const loc = locate(d as DesignDocument, g.id);
            if (!loc) continue;
            const gm = fromTransform(g.transform);
            const children = g.children.map((c) => {
              released.push(c.id);
              return {
                ...c,
                opacity: c.opacity * g.opacity,
                transform: toTransform(multiply(gm, fromTransform(c.transform))),
              } as SceneNode;
            });
            (loc.parent.children as SceneNode[]).splice(loc.index, 1, ...children);
          }
        },
        { label: 'Ungroup' },
      );
      return released;
    },

    setArtboard: (patch, opts) => {
      apply((d) => void Object.assign(d.artboard, patch), { label: opts?.label ?? 'Artboard' });
    },

    rename: (name) => apply((d) => void (d.name = name), { label: 'Rename document' }),

    duplicate: (ids, offset = 10) => {
      const doc = get().doc;
      const ordered = sortByDocumentOrder(doc, topmostIds(doc, ids));
      const newIds: Id[] = [];
      const idMap = new Map<Id, Id>();
      apply(
        (d) => {
          for (const id of [...ordered].reverse()) {
            const loc = locate(d as DesignDocument, id);
            if (!loc) continue;
            const original = findNode(doc, id)!;
            const copy = cloneWithNewIds(original);
            copyIdMap(original, copy, idMap);
            copy.transform = { ...copy.transform, x: copy.transform.x + offset, y: copy.transform.y + offset };
            (loc.parent.children as SceneNode[]).splice(loc.index + 1, 0, copy);
            newIds.unshift(copy.id);
          }
          // The copies keep their originals' outgoing flows.
          if (doc.wireframe) attachFlows(d, copyFlows(flowsOf(doc), idMap));
        },
        { label: 'Duplicate' },
      );
      return newIds;
    },

    findNode: (id) => findNode(get().doc, id),
    getParent: (id) => getParent(get().doc, id),
  };
});
