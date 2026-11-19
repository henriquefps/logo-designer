import { cloneWithNewIds, sortByDocumentOrder, topmostIds, type Id, type SceneNode, type WireframeFlow } from '@/model';
import { copyFlows, copyIdMap, flowsInside } from '@/wireframe/flows';
import { useDocStore } from './useDocStore';

/** In-app clipboard. Also mirrored to the system clipboard as JSON (best effort). */
let buffer: SceneNode[] = [];
/** Outgoing flows of the copied elements (wireframes); pasted along when their target screen exists. */
let bufferFlows: WireframeFlow[] = [];
let pasteCount = 0;

export const CLIPBOARD_MIME_PREFIX = 'designer/nodes:';

export function copyNodes(ids: Id[]): number {
  const { doc } = useDocStore.getState();
  const ordered = sortByDocumentOrder(doc, topmostIds(doc, ids));
  buffer = ordered.map((id) => structuredClone(useDocStore.getState().findNode(id)!));
  bufferFlows = flowsInside(doc, buffer);
  pasteCount = 0;
  try {
    const payload = bufferFlows.length ? { nodes: buffer, flows: bufferFlows } : buffer;
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

/** Pastes at the root on top, offset by 10 per consecutive paste. Returns new ids. */
export function pasteNodes(nodes: SceneNode[] = buffer, flows: WireframeFlow[] = nodes === buffer ? bufferFlows : []): Id[] {
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
  // Flows whose target screen does not exist in this document are dropped by addNodes.
  return useDocStore.getState().addNodes(copies, { label: 'Paste', flows: copyFlows(flows, ids) });
}

export interface ClipboardPayload {
  nodes: SceneNode[];
  flows: WireframeFlow[];
}

/** Parses nodes (and their flows) copied by this app from system clipboard text, or null. */
export function parseClipboardPayload(text: string): ClipboardPayload | null {
  if (!text.startsWith(CLIPBOARD_MIME_PREFIX)) return null;
  try {
    const data = JSON.parse(text.slice(CLIPBOARD_MIME_PREFIX.length));
    if (Array.isArray(data)) return { nodes: data as SceneNode[], flows: [] };
    if (data && Array.isArray(data.nodes)) return { nodes: data.nodes as SceneNode[], flows: Array.isArray(data.flows) ? (data.flows as WireframeFlow[]) : [] };
    return null;
  } catch {
    return null;
  }
}

/** Parses nodes copied by this app from system clipboard text, or null. */
export const parseClipboardText = (text: string): SceneNode[] | null => parseClipboardPayload(text)?.nodes ?? null;
