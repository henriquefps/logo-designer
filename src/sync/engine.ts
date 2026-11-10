import { create } from 'zustand';
import { validateDocument } from '@/io/projectFile';
import { loadDocument, loadProjectList } from '@/store/persistence';
import { useProjectsStore } from '@/store/useProjectsStore';
import { readUploadData, listUploads, saveUpload, deleteUpload, type UploadedFace } from '@/fonts/uploads';
import { reloadUploads } from '@/fonts/store';
import { SyncError, getItem, listItems, putItem, type Connection, type Kind } from './api';
import { base64ToBytes, bytesToBase64 } from './base64';
import { conflictedName, countPending, planSync, type LocalItem, type Step } from './plan';
import {
  loadKindState,
  loadLastSyncedAt,
  loadSettings,
  saveLastSyncedAt,
  saveSettings,
  updateKindState,
  type SyncSettings,
} from './state';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'offline';

interface SyncStoreState {
  settings: SyncSettings;
  status: SyncStatus;
  error: string | null;
  lastSyncedAt: number | null;
  /** Local changes the server does not have yet (edits and deletions). */
  pending: number;
  /** Conflicted copies created since this page was opened. */
  conflicts: number;
  setSettings: (patch: Partial<SyncSettings>) => void;
}

const configured = (s: SyncSettings) => s.enabled && s.url.trim().length > 0;

export const useSyncStore = create<SyncStoreState>()((set, get) => {
  const settings = loadSettings();
  return {
    settings,
    status: configured(settings) ? 'idle' : 'off',
    error: null,
    lastSyncedAt: loadLastSyncedAt(),
    pending: 0,
    conflicts: 0,
    setSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      saveSettings(next);
      // 'syncing' until the first cycle (started right after by startSync) reports how it went.
      set({ settings: next, error: null, status: configured(next) ? 'syncing' : 'off' });
    },
  };
});

export const isSyncConfigured = () => configured(useSyncStore.getState().settings);

// ---------- one sync cycle ----------

class Collector {
  base: Record<string, number | null> = {}; // null = delete
  tombstonesCleared = new Set<string>();
  firstError: Error | null = null;
  setBase(id: string, at: number) {
    this.base[id] = at;
  }
  forget(id: string) {
    this.base[id] = null;
    this.tombstonesCleared.add(id);
  }
  async save(kind: Kind) {
    await updateKindState(kind, (s) => {
      for (const [id, v] of Object.entries(this.base)) {
        if (v === null) delete s.base[id];
        else s.base[id] = v;
      }
      for (const id of this.tombstonesCleared) delete s.tombstones[id];
    });
  }
  /** Network and auth errors stop the whole cycle; anything else only fails that item. */
  fail(e: unknown, what: string) {
    if (e instanceof SyncError && (e.kind === 'offline' || e.kind === 'auth')) throw e;
    this.firstError ??= new Error(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function syncProjects(conn: Connection): Promise<void> {
  const [remote, st, list] = await Promise.all([listItems(conn, 'projects'), loadKindState('projects'), loadProjectList()]);
  // A project nobody has touched (the "Untitled" a fresh device starts with) is not worth a server round trip:
  // otherwise every new device would add an empty project to all the others.
  const pristine = (p: (typeof list)[number]) => st.base[p.id] === undefined && p.name === 'Untitled' && p.updatedAt === p.createdAt;
  const steps = planSync({
    local: list.filter((p) => !pristine(p)).map((p) => ({ id: p.id, updatedAt: p.updatedAt })),
    tombstones: st.tombstones,
    remote,
    base: st.base,
  });
  const names = new Map(list.map((p) => [p.id, p.name]));
  const c = new Collector();
  const projects = () => useProjectsStore.getState();

  try {
    for (const step of steps) {
      try {
        await projectStep(conn, step, st.base[step.id], c, projects);
      } catch (e) {
        c.fail(e, `“${names.get(step.id) ?? remote.find((r) => r.id === step.id)?.name ?? step.id}”`);
      }
    }
  } finally {
    await c.save('projects');
  }
  if (c.firstError) throw c.firstError;
}

async function projectStep(conn: Connection, step: Step, base: number | undefined, c: Collector, projects: typeof useProjectsStore.getState) {
  const id = step.id;
  switch (step.op) {
    case 'push': {
      const doc = await loadDocument(id);
      if (!doc) return;
      const r = await putItem(conn, 'projects', id, {
        name: doc.name,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        deleted: false,
        base,
        data: doc,
      });
      if (r.applied) c.setBase(id, r.item.updatedAt);
      return;
    }
    case 'push-delete': {
      const r = await putItem(conn, 'projects', id, { name: '', createdAt: 0, updatedAt: step.updatedAt, deleted: true, base });
      if (r.applied) c.forget(id);
      return;
    }
    case 'pull': {
      const rec = await getItem(conn, 'projects', id);
      if (rec.deleted || rec.data == null) return;
      const incoming = { ...validateDocument(rec.data), id, name: rec.name || 'Untitled', createdAt: rec.createdAt, updatedAt: rec.updatedAt };
      const local = step.keepLocalCopy ? await loadDocument(id) : null;
      if (!(await projects().applyRemote(incoming))) return; // the open project has unsaved edits: next cycle
      if (local) {
        await projects().addConflictedCopy(local, conflictedName(local.name, Date.now()));
        useSyncStore.setState((s) => ({ conflicts: s.conflicts + 1 }));
      }
      c.setBase(id, rec.updatedAt);
      return;
    }
    case 'delete-local': {
      const local = step.keepLocalCopy ? await loadDocument(id) : null;
      if (!(await projects().removeRemote(id))) return;
      if (local) {
        await projects().addConflictedCopy(local, conflictedName(local.name, Date.now()));
        useSyncStore.setState((s) => ({ conflicts: s.conflicts + 1 }));
      }
      c.forget(id);
      return;
    }
    case 'settle':
      c.setBase(id, step.updatedAt);
      return;
    case 'forget':
      c.forget(id);
      return;
  }
}

/** The time a font counts as last changed: renaming its family bumps `updatedAt`, adding sets `addedAt`. */
const fontTime = (f: UploadedFace) => f.updatedAt ?? f.addedAt;

async function syncFonts(conn: Connection): Promise<void> {
  const [remote, st, uploads] = await Promise.all([listItems(conn, 'fonts'), loadKindState('fonts'), listUploads()]);
  const local: LocalItem[] = uploads.map((f) => ({ id: f.id, updatedAt: fontTime(f) }));
  const steps = planSync({ local, tombstones: st.tombstones, remote, base: st.base });
  const byId = new Map(uploads.map((f) => [f.id, f]));
  const c = new Collector();
  const changed: string[] = [];

  try {
    for (const step of steps) {
      const id = step.id;
      try {
        if (step.op === 'push') {
          const face = byId.get(id);
          const bytes = await readUploadData(id);
          if (!face || !bytes) continue;
          // `private`: a font file is a licensed asset. It goes to this user's own server only, is never served
          // without the API key (or the LAN) and is not meant to leave the sync folder.
          const r = await putItem(conn, 'fonts', id, {
            name: `${face.family} ${face.subfamily}`.trim(),
            createdAt: face.addedAt,
            updatedAt: fontTime(face),
            deleted: false,
            data: { private: true, face, data: bytesToBase64(bytes) },
          });
          if (r.applied) c.setBase(id, r.item.updatedAt);
        } else if (step.op === 'push-delete') {
          const r = await putItem(conn, 'fonts', id, { name: '', createdAt: 0, updatedAt: step.updatedAt, deleted: true });
          if (r.applied) c.forget(id);
        } else if (step.op === 'pull') {
          const rec = await getItem(conn, 'fonts', id);
          const payload = rec.data as { face?: UploadedFace; data?: string } | undefined;
          if (rec.deleted || !payload?.face || typeof payload.data !== 'string') continue;
          await saveUpload({ ...payload.face, id, updatedAt: rec.updatedAt }, base64ToBytes(payload.data));
          changed.push(id);
          c.setBase(id, rec.updatedAt);
        } else if (step.op === 'delete-local') {
          await deleteUpload(id);
          changed.push(id);
          c.forget(id);
        } else if (step.op === 'settle') c.setBase(id, step.updatedAt);
        else c.forget(id);
      } catch (e) {
        c.fail(e, `Font “${byId.get(id)?.family ?? id}”`);
      }
    }
  } finally {
    await c.save('fonts');
    if (changed.length) await reloadUploads(changed);
  }
  if (c.firstError) throw c.firstError;
}

// ---------- scheduling ----------

let inFlight: Promise<void> | null = null;
let rerun = false;
let failures = 0;
let nextRetryAt = 0;

async function refreshPending(): Promise<void> {
  try {
    const [list, p] = await Promise.all([loadProjectList(), loadKindState('projects')]);
    let pending = countPending(list.filter((x) => !(p.base[x.id] === undefined && x.name === 'Untitled' && x.updatedAt === x.createdAt)), p.tombstones, p.base);
    if (useSyncStore.getState().settings.syncFonts) {
      const [fonts, f] = await Promise.all([listUploads(), loadKindState('fonts')]);
      pending += countPending(fonts.map((x) => ({ id: x.id, updatedAt: fontTime(x) })), f.tombstones, f.base);
    }
    useSyncStore.setState({ pending });
  } catch {
    // The indicator is informational.
  }
}

/** Runs one sync now (one at a time: a request while one runs asks for another right after). */
export function syncNow(): Promise<void> {
  if (!isSyncConfigured()) return Promise.resolve();
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = (async () => {
    const { settings } = useSyncStore.getState();
    const conn: Connection = { url: settings.url, apiKey: settings.apiKey };
    useSyncStore.setState({ status: 'syncing', error: null });
    try {
      await useProjectsStore.getState().flush(); // autosave first: the sync must see the latest edit
      if (settings.syncFonts) await syncFonts(conn); // fonts first, so projects pulled next find them
      await syncProjects(conn);
      const at = Date.now();
      saveLastSyncedAt(at);
      failures = 0;
      nextRetryAt = 0;
      useSyncStore.setState({ status: 'idle', error: null, lastSyncedAt: at });
    } catch (e) {
      failures++;
      nextRetryAt = Date.now() + Math.min(30_000 * 2 ** (failures - 1), 300_000);
      const offline = e instanceof SyncError && e.kind === 'offline';
      useSyncStore.setState({ status: offline ? 'offline' : 'error', error: e instanceof Error ? e.message : 'Sync failed.' });
    } finally {
      await refreshPending();
      inFlight = null;
      if (rerun && isSyncConfigured()) {
        rerun = false;
        void syncNow();
      }
    }
  })();
  return inFlight;
}

const INTERVAL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 2_000;

/** Pull on start, on focus and every 30 s; push 2 s after the last autosave. Returns a stop function. */
export function startSync(): () => void {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms: number) => {
    if (!isSyncConfigured()) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), ms);
  };
  const onFocus = () => void syncNow();
  const onVisible = () => document.visibilityState === 'visible' && void syncNow();
  const interval = setInterval(() => {
    if (Date.now() >= nextRetryAt) void syncNow();
  }, INTERVAL_MS);

  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onFocus);
  document.addEventListener('visibilitychange', onVisible);

  const unsubProjects = useProjectsStore.subscribe((s, prev) => {
    if (s.projects === prev.projects) return;
    void refreshPending();
    if (!inFlight) soon(PUSH_DEBOUNCE_MS); // an autosave landed
    else rerun = true;
  });
  const unsubSettings = useSyncStore.subscribe((s, prev) => {
    if (s.settings === prev.settings) return;
    failures = 0;
    nextRetryAt = 0;
    soon(300);
  });

  void refreshPending();
  void syncNow();
  return () => {
    if (debounce) clearTimeout(debounce);
    clearInterval(interval);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
    unsubProjects();
    unsubSettings();
  };
}
