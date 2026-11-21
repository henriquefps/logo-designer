import { cloneWithNewIds, locate, sortByDocumentOrder, topmostIds, type DesignDocument, type Id, type SceneNode, type WireframeFlow } from '@/model';
import { insertIntoLayout } from '@/wireframe/layoutEdit';
import { isSlot, sharedOwner, slotTarget } from '@/wireframe/symbols';
import { useEditorStore } from './useEditorStore';
import { attachFlows, copyFlows, copyIdMap, flowsInside, screenIdsOf } from '@/wireframe/flows';
import { detachUnknownInstances, importForPaste, symbolSourceFor, type SymbolImport, type SymbolSource } from '@/wireframe/symbolImport';
import { useDocStore } from './useDocStore';

/** In-app clipboard. Also mirrored to the system clipboard as JSON (best effort). */
let buffer: SceneNode[] = [];
/** Outgoing flows of the copied elements (wireframes); pasted along when their target screen exists. */
let bufferFlows: WireframeFlow[] = [];
/** The masters the copied instances use (wireframes): pasted into a document without them, they are imported. */
let bufferSymbols: SymbolSource | null = null;
let pasteCount = 0;
/** What the last paste imported (shared components the target lacked), for feedback; null = nothing. */
let lastImport: SymbolImport | null = null;
export const lastPasteImport = () => lastImport;

export const CLIPBOARD_MIME_PREFIX = 'designer/nodes:';

export function copyNodes(ids: Id[]): number {
  const { doc } = useDocStore.getState();
  const ordered = sortByDocumentOrder(doc, topmostIds(doc, ids));
  buffer = ordered.map((id) => structuredClone(useDocStore.getState().findNode(id)!));
  bufferFlows = flowsInside(doc, buffer);
  bufferSymbols = symbolSourceFor(doc, buffer);
  pasteCount = 0;
  try {
    const payload = bufferFlows.length || bufferSymbols ? { nodes: buffer, flows: bufferFlows, ...(bufferSymbols ? { symbols: bufferSymbols } : {}) } : buffer;
    void navigator.clipboard?.writeText(CLIPBOARD_MIME_PREFIX + JSON.stringify(payload)).catch(() => {});
  } catch {
    // Clipboard API unavailable (tests, insecure context).
  }
  return buffer.length;
}

export function cutNodes(ids: Id[]): number {
  const n = copyNodes(ids);
  useDocStore.getState().deleteNodes(ids);
  pasteCount = -1; // first paste after a cut lands in place
  return n;
}

export const hasClipboard = () => buffer.length > 0;

/**
 * Pastes at the root on top, offset by 10 per consecutive paste. Returns new ids. Instances of shared
 * components the document lacks bring their masters along (`symbols`, imported with dedup), in the same
 * undo step; within the same document nothing changes.
 */
export function pasteNodes(nodes: SceneNode[] = buffer, flows: WireframeFlow[] = nodes === buffer ? bufferFlows : [], symbols: SymbolSource | null = nodes === buffer ? bufferSymbols : null): Id[] {
  lastImport = null;
  if (!nodes.length) return [];
  pasteCount++;
  const offset = 10 * pasteCount;
  const ids = new Map<Id, Id>();
  const copies = nodes.map((n) => {
    const c = cloneWithNewIds(n);
    copyIdMap(n, c, ids);
    c.transform = { ...c.transform, x: c.transform.x + offset, y: c.transform.y + offset };
    return c;
  });
  const copied = copyFlows(flows, ids);
  const slot = pasteSlot();
  useDocStore.getState().apply(
    (d) => {
      const plan = importForPaste(d, copies, symbols);
      if (plan && (plan.added.length || plan.reused.length)) lastImport = plan;
      detachUnknownInstances(d, copies);
      // Into the selected slot of a shared instance (its own content); else on top of the canvas.
      if (!slot || !insertIntoLayout(d, slot.parentId, copies, slot.index)) (d.children as SceneNode[]).push(...copies);
      // Flows whose target screen does not exist in this document are dropped.
      if (copied.length) attachFlows(d as DesignDocument, copied, screenIdsOf(copies));
    },
    { label: 'Paste' },
  );
  return copies.map((c) => c.id);
}

/**
 * Wireframes: where a paste goes when the selection is in a slot of a shared instance (the slot itself, an
 * instance with a slot, or something in a slot: after it). Null = the usual place (the canvas, then the screen
 * under it).
 */
function pasteSlot(): { parentId: Id; index?: number } | null {
  const doc = useDocStore.getState().doc;
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const loc = locate(doc, sel[0]);
  if (!loc) return null;
  const into = slotTarget(loc.node, loc.ancestors);
  if (into) return { parentId: into.id };
  const parent = loc.parent !== doc ? (loc.parent as SceneNode) : null;
  if (parent && isSlot(parent) && sharedOwner(loc.ancestors.slice(0, -1))) return { parentId: parent.id, index: loc.index + 1 };
  return null;
}

export interface ClipboardPayload {
  nodes: SceneNode[];
  flows: WireframeFlow[];
  /** The masters of the shared components the nodes use (`symbolSourceFor`). */
  symbols?: SymbolSource;
}

/** Parses nodes (and their flows) copied by this app from system clipboard text, or null. */
export function parseClipboardPayload(text: string): ClipboardPayload | null {
  if (!text.startsWith(CLIPBOARD_MIME_PREFIX)) return null;
  try {
    const data = JSON.parse(text.slice(CLIPBOARD_MIME_PREFIX.length));
    if (Array.isArray(data)) return { nodes: data as SceneNode[], flows: [] };
    if (data && Array.isArray(data.nodes)) {
      const symbols = data.symbols?.wireframe && Array.isArray(data.symbols.wireframe.symbols) ? (data.symbols as SymbolSource) : undefined;
      return { nodes: data.nodes as SceneNode[], flows: Array.isArray(data.flows) ? (data.flows as WireframeFlow[]) : [], ...(symbols ? { symbols } : {}) };
    }
    return null;
  } catch {
    return null;
  }
}

/** Parses nodes copied by this app from system clipboard text, or null. */
export const parseClipboardText = (text: string): SceneNode[] | null => parseClipboardPayload(text)?.nodes ?? null;
