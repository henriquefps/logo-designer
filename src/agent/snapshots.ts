// The project as it was when a job was sent, for "Undo the agent's changes". In IndexedDB (`designer-agent`), so
// the undo survives a reload; only the newest few are kept (a wireframe is a few hundred KB).
import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { DesignDocument } from '@/model';

export const MAX_SNAPSHOTS = 20;

let store: UseStore | null = null;
const db = () => (store ??= createStore('designer-agent', 'kv'));
const INDEX = 'snapshots';

/** In memory too: the panel asks "has a snapshot?" on every render. */
const known = new Set<string>();
let loaded: Promise<void> | null = null;

export function loadSnapshotIndex(): Promise<Set<string>> {
  loaded ??= get<string[]>(INDEX, db())
    .then((ids) => void (ids ?? []).forEach((id) => known.add(id)))
    .catch(() => undefined);
  return loaded.then(() => new Set(known));
}

export async function saveSnapshot(jobId: string, doc: DesignDocument): Promise<void> {
  await loadSnapshotIndex();
  await set(`snap:${jobId}`, structuredClone(doc), db());
  const ids = [...known.add(jobId)];
  const drop = ids.slice(0, Math.max(0, ids.length - MAX_SNAPSHOTS));
  for (const id of drop) {
    known.delete(id);
    await del(`snap:${id}`, db()).catch(() => undefined);
  }
  await set(INDEX, [...known], db());
}

export const loadSnapshot = (jobId: string) => get<DesignDocument>(`snap:${jobId}`, db());

export const hasSnapshot = (jobId: string) => known.has(jobId);

/**
 * Pure: the document `current` with the content of `snapshot` (what the agent changed goes back). The project's
 * identity and live state stay as they are now: id, name, dates and the live mark.
 */
export function restoredContent(current: DesignDocument, snapshot: DesignDocument): DesignDocument {
  const keep = { id: current.id, name: current.name, createdAt: current.createdAt, updatedAt: current.updatedAt, ...(current.live ? { live: current.live } : {}) };
  const content = structuredClone(snapshot) as Partial<DesignDocument>;
  delete content.live;
  return { ...content, ...keep } as DesignDocument;
}
