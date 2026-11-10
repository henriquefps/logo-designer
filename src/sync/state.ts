import { createStore, get, set, type UseStore } from 'idb-keyval';
import type { Kind } from './api';

// What a device remembers about syncing, apart from the projects themselves.
//  - settings (server address, key, switches) and the last sync time: localStorage (per browser).
//  - per kind: `base` (id -> updatedAt both sides had at the last sync of that id) and `tombstones`
//    (local deletions the server has not been told yet) in IndexedDB `designer-sync`. The tombstones
//    are the offline queue for deletions; for edits the queue is implicit (updatedAt !== base).

export interface SyncSettings {
  enabled: boolean;
  url: string;
  apiKey: string;
  /** Also sync the fonts you uploaded (private, go to your server only). */
  syncFonts: boolean;
}

export const DEFAULT_SETTINGS: SyncSettings = { enabled: false, url: '', apiKey: '', syncFonts: true };

const SETTINGS_KEY = 'designer.sync';
const LAST_KEY = 'designer.sync.last';

export function loadSettings(): SyncSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<SyncSettings> | null;
    return {
      enabled: raw?.enabled === true,
      url: typeof raw?.url === 'string' ? raw.url : '',
      apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : '',
      syncFonts: raw?.syncFonts !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: SyncSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Settings then last for this page load only.
  }
}

export function loadLastSyncedAt(): number | null {
  try {
    const n = Number(localStorage.getItem(LAST_KEY));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveLastSyncedAt(at: number): void {
  try {
    localStorage.setItem(LAST_KEY, String(at));
  } catch {
    // ignore
  }
}

export interface KindState {
  base: Record<string, number>;
  tombstones: Record<string, number>;
}

let store: UseStore | null = null;
const db = () => (store ??= createStore('designer-sync', 'kv'));
const key = (kind: Kind) => `state:${kind}`;

// One read-modify-write at a time: a deletion recorded by the UI can land while a sync is writing bases.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function loadKindState(kind: Kind): Promise<KindState> {
  const s = await get<Partial<KindState>>(key(kind), db());
  return { base: { ...s?.base }, tombstones: { ...s?.tombstones } };
}

export function updateKindState(kind: Kind, fn: (s: KindState) => void): Promise<KindState> {
  return exclusive(async () => {
    const s = await loadKindState(kind);
    fn(s);
    await set(key(kind), s, db());
    return s;
  });
}

/** Called when the user deletes a project or font here: queue the deletion for the server. */
export function recordDeletion(kind: Kind, id: string, at = Date.now()): Promise<unknown> {
  return updateKindState(kind, (s) => {
    s.tombstones[id] = at;
  }).catch(() => undefined);
}
