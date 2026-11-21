// Shared component commands for the app (docs/wireframe-mode.md → Shared components): Make component
// (with the name prompt), insert from My components (click / drop), rename, delete master, detach.
// Document logic: ./symbols.ts (pure); this file adds the stores.
import { create } from 'zustand';
import { toast } from 'sonner';
import { findNode, isScreenNode, locate, topmostIds, type DesignDocument, type GroupNode, type Id, type SceneNode, type Vec } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { clickTarget, frameAt, type Target } from './componentCommands';
import { EMPTY_CONTAINER } from './containers';
import { FREE_GAP, FREE_MARGIN } from './instances';
import { layoutDropTarget } from './layoutEdit';
import { placementArea } from './placement';
import { contentBottom } from './screens';
import { localizeSharedFlows } from './flows';
import {
  sharedOwner,
  defaultSymbolName,
  deleteSymbol,
  detachSymbolInstance,
  getSymbol,
  instancesOf,
  isSymbolInstance,
  makeSymbol,
  makeSymbolProblem,
  newSymbolInstance,
  reaches,
  renameSymbol,
  symbolsOf,
  type SymbolInstance,
} from './symbols';

/** The shared component dialog (`sharedComponent`): name a new one, rename one, or confirm deleting a master. */
export type SymbolDialogState =
  | { mode: 'make'; nodeId: Id; name: string }
  | { mode: 'rename'; symbolId: Id; name: string }
  | { mode: 'delete'; symbolId: Id; name: string; instances: number }
  | null;

export const useSymbolDialog = create<{ state: SymbolDialogState }>(() => ({ state: null }));
export const SYMBOL_DIALOG = 'sharedComponent';

const open = (state: NonNullable<SymbolDialogState>) => {
  useSymbolDialog.setState({ state });
  useEditorStore.getState().openDialog(SYMBOL_DIALOG);
};

/** The one selected node that can become a shared component, or null. */
export function makeTarget(doc = useDocStore.getState().doc): GroupNode | null {
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const loc = locate(doc, sel[0]);
  if (!loc) return null;
  return makeSymbolProblem(loc.node, loc.ancestors) ? null : (loc.node as GroupNode);
}

/** Object → Make component: asks for a name (default: the container's or the first text's label). */
export function startMakeComponent(): boolean {
  const n = makeTarget();
  if (!n) return false;
  open({ mode: 'make', nodeId: n.id, name: defaultSymbolName(n) });
  return true;
}

/** Makes `nodeId` the first instance of a new shared component (one undo step). Returns the master id. */
export function makeComponentCommand(nodeId: Id, name: string): Id | null {
  let id: Id | null = null;
  useDocStore.getState().apply((d) => void (id = makeSymbol(d, nodeId, name)), { label: 'Make component' });
  if (id) useEditorStore.getState().setSelection([nodeId]);
  return id;
}

export function startRenameSymbol(symbolId: Id) {
  const s = getSymbol(useDocStore.getState().doc, symbolId);
  if (s) open({ mode: 'rename', symbolId, name: s.name });
}

export function renameSymbolCommand(symbolId: Id, name: string) {
  useDocStore.getState().apply((d) => void renameSymbol(d, symbolId, name), { label: 'Rename component' });
}

/** Delete master: asks first when instances exist (they become plain content). */
export function startDeleteSymbol(symbolId: Id) {
  const doc = useDocStore.getState().doc;
  const s = getSymbol(doc, symbolId);
  if (!s) return;
  const instances = instancesOf(doc, symbolId).length;
  if (!instances) return deleteSymbolCommand(symbolId);
  open({ mode: 'delete', symbolId, name: s.name, instances });
}

export function deleteSymbolCommand(symbolId: Id) {
  useDocStore.getState().apply(
    (d) => {
      // Links defined in the master stay on every screen, as links of each (now plain) copy.
      localizeSharedFlows(d, symbolId);
      deleteSymbol(d, symbolId);
    },
    { label: 'Delete component' },
  );
}

/** The selected shared instance (exactly one selected object that is one), or null. */
export function selectedSymbolInstance(): SymbolInstance | null {
  const { doc } = useDocStore.getState();
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const n = findNode(doc, sel[0]);
  return n && isSymbolInstance(n) ? n : null;
}

/** Ids of selected shared instances (topmost). */
export function selectedSymbolInstanceIds(): Id[] {
  const { doc } = useDocStore.getState();
  if (!doc.wireframe) return [];
  return topmostIds(doc, useEditorStore.getState().selection).filter((id) => {
    const n = findNode(doc, id);
    return !!n && isSymbolInstance(n);
  });
}

function findDraft(nodes: SceneNode[], id: Id): SceneNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === 'group') {
      const hit = findDraft(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Detach: the selected instances become plain content (one undo step). */
export function detachSymbolSelected(): number {
  const ids = selectedSymbolInstanceIds();
  if (!ids.length) return 0;
  const doc = useDocStore.getState().doc;
  useDocStore.getState().apply(
    (d) => {
      for (const id of ids) {
        const n = findNode(doc, id);
        // The master's links stay on this copy, as its own.
        if (n && isSymbolInstance(n)) localizeSharedFlows(d, n.symbol.id, [id]);
        const draft = findDraft(d.children as SceneNode[], id);
        if (draft) detachSymbolInstance(draft);
      }
    },
    { label: ids.length === 1 ? 'Detach shared component' : 'Detach shared components' },
  );
  return ids.length;
}

/** True when putting an instance of `symbolId` into `parentId` would make a master contain itself. */
function wouldNestInItself(doc: DesignDocument, symbolId: Id, parentId: Id | null): boolean {
  if (!parentId) return false;
  const loc = locate(doc, parentId);
  if (!loc) return false;
  const chain: SceneNode[] = [...loc.ancestors, loc.node];
  const symbols = symbolsOf(doc);
  return chain.some((n) => n.type === 'group' && !!n.symbol && reaches(symbols, symbolId, n.symbol.id));
}

/**
 * Inserts a new instance of shared component `symbolId`: at `at` (a drop: into the innermost stack under
 * the pointer) or into the selected container / screen (a click). Selects it. Returns its id, or null
 * (unknown, or it would end up inside an instance of itself).
 */
export function insertSymbol(symbolId: Id, at?: Vec): Id | null {
  const { doc } = useDocStore.getState();
  const s = getSymbol(doc, symbolId);
  if (!s || !doc.wireframe) return null;
  const symbols = symbolsOf(doc);
  const laid = !!s.content.layout;
  const freeWidth = (frameWidth: number) => (laid ? Math.max(EMPTY_CONTAINER.width, frameWidth - 2 * FREE_MARGIN) : undefined);
  let node: GroupNode;
  let target: Target;
  const stack = at ? layoutDropTarget(doc, at) : null;
  if (stack) {
    node = newSymbolInstance(s, symbols, { x: 0, y: 0 });
    target = { parentId: stack.containerId, index: stack.index, container: null };
  } else if (at) {
    const frame = frameAt(doc, at);
    if (frame) {
      node = newSymbolInstance(s, symbols, { x: FREE_MARGIN, y: Math.max(0, at.y - frame.transform.y) }, freeWidth(frame.screen.width));
      target = { parentId: frame.id, container: frame };
    } else {
      node = newSymbolInstance(s, symbols, at);
      target = { parentId: null, container: null };
    }
  } else {
    target = clickTarget(doc);
    const c = target.container;
    if (c?.layout) node = newSymbolInstance(s, symbols, { x: 0, y: 0 });
    else if (c && isScreenNode(c)) {
      const bottom = c.children.length ? contentBottom(c) : 0;
      node = newSymbolInstance(s, symbols, { x: FREE_MARGIN, y: bottom ? bottom + FREE_GAP : FREE_MARGIN }, freeWidth(c.screen.width));
    } else {
      const area = placementArea();
      node = newSymbolInstance(s, symbols, { x: area.x + area.width / 2 - 160, y: area.y + area.height / 2 - 40 });
    }
  }
  if (wouldNestInItself(doc, symbolId, target.parentId)) return null;
  const [id] = useDocStore.getState().addNodes([node], { parentId: target.parentId, index: target.index, label: `Add ${s.name}` });
  useEditorStore.getState().setSelection([id]);
  return id;
}

/**
 * After something was put into `parentId` (Layers, a command): when that is the shared part of an instance (not
 * one of its slots), the master changed and every instance with it. Says so in a toast. Returns the master's name.
 */
export function notifySharedChange(parentId: Id | null): string | null {
  if (!parentId) return null;
  const doc = useDocStore.getState().doc;
  const loc = locate(doc, parentId);
  if (!loc) return null;
  const owner = sharedOwner([...loc.ancestors, loc.node]);
  const s = owner && getSymbol(doc, owner.symbol.id);
  if (!s) return null;
  const n = instancesOf(doc, s.id).length;
  toast(`Changed shared component ${s.name} (${n} ${n === 1 ? 'instance' : 'instances'})`, {
    description: 'Put it in a slot (“Content per instance”) to keep it on one screen.',
  });
  return s.name;
}
