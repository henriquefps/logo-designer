import { cloneWithNewIds, sortByDocumentOrder, topmostIds, type Id, type SceneNode } from '@/model';
import { useDocStore } from './useDocStore';

/** In-app clipboard. Also mirrored to the system clipboard as JSON (best effort). */
let buffer: SceneNode[] = [];
let pasteCount = 0;

export const CLIPBOARD_MIME_PREFIX = 'designer/nodes:';

export function copyNodes(ids: Id[]): number {
  const { doc } = useDocStore.getState();
  const ordered = sortByDocumentOrder(doc, topmostIds(doc, ids));
  buffer = ordered.map((id) => structuredClone(useDocStore.getState().findNode(id)!));
  pasteCount = 0;
  try {
    void navigator.clipboard?.writeText(CLIPBOARD_MIME_PREFIX + JSON.stringify(buffer)).catch(() => {});
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
export function pasteNodes(nodes: SceneNode[] = buffer): Id[] {
  if (!nodes.length) return [];
  pasteCount++;
  const offset = 10 * pasteCount;
  const copies = nodes.map((n) => {
    const c = cloneWithNewIds(n);
    c.transform = { ...c.transform, x: c.transform.x + offset, y: c.transform.y + offset };
    return c;
  });
  return useDocStore.getState().addNodes(copies, { label: 'Paste' });
}

/** Parses nodes copied by this app from system clipboard text, or null. */
export function parseClipboardText(text: string): SceneNode[] | null {
  if (!text.startsWith(CLIPBOARD_MIME_PREFIX)) return null;
  try {
    const nodes = JSON.parse(text.slice(CLIPBOARD_MIME_PREFIX.length));
    return Array.isArray(nodes) ? (nodes as SceneNode[]) : null;
  } catch {
    return null;
  }
}
