import { create } from 'zustand';
import { createDocument, newId, type DesignDocument, type Id } from '@/model';
import {
  deleteDocument,
  deleteFileHandle,
  getActiveProjectId,
  loadDocument,
  loadProjectList,
  metaOf,
  saveDocument,
  saveProjectList,
  setActiveProjectId,
  type ProjectMeta,
} from './persistence';
import { deviceId, recordDeletion } from '@/sync/state';
import { appEditor, LIVE_AUTOSAVE_DELAY } from '@/sync/live';
import { useDocStore } from './useDocStore';
import { useEditorStore } from './useEditorStore';
import { fitTarget } from '@/wireframe/view';

export const AUTOSAVE_DELAY = 600;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface ProjectsState {
  projects: ProjectMeta[];
  activeId: Id | null;
  ready: boolean;
  saveState: SaveState;

  init: () => Promise<void>;
  /** New project (optionally with an artboard size) and opens it. */
  create: (name?: string, size?: { width: number; height: number }) => Promise<Id>;
  open: (id: Id) => Promise<void>;
  /** Adds an existing document (e.g. opened from a project file) as a new project and opens it. */
  importDocument: (doc: DesignDocument) => Promise<Id>;
  rename: (id: Id, name: string) => Promise<void>;
  duplicate: (id: Id) => Promise<Id | null>;
  remove: (id: Id) => Promise<void>;
  /** Sync: stores a project that came from the sync server (keeps its id and updatedAt). false = the open project has unsaved edits, retry later. */
  applyRemote: (doc: DesignDocument) => Promise<boolean>;
  /** Sync: removes a project the server deleted (no tombstone, the server already has it). false = retry later. */
  removeRemote: (id: Id) => Promise<boolean>;
  /** Sync: keeps a version that lost a conflict as a separate project; it is not opened. */
  addConflictedCopy: (doc: DesignDocument, name: string) => Promise<Id>;
  /** Saves the active document now (cancels a pending autosave). */
  flush: () => Promise<void>;
  /** Live editing: turns the active project's `live` mark off (saved and synced like an edit). */
  stopLive: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
/** True while a pulled version is loaded into the editor: that is not an edit, so it must not autosave (and push back). */
let loadingRemote = false;

function upsert(list: ProjectMeta[], meta: ProjectMeta) {
  return [meta, ...list.filter((p) => p.id !== meta.id)].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useProjectsStore = create<ProjectsState>()((set, get) => {
  const activate = (doc: DesignDocument) => {
    useDocStore.getState().load(doc);
    useEditorStore.getState().setSelection([]);
    setActiveProjectId(doc.id);
    set({ activeId: doc.id });
    // Fit the artboard (a wireframe's content) once the canvas knows its size.
    useEditorStore.getState().fitRect(fitTarget(useDocStore.getState().doc));
  };

  const save = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const { activeId } = get();
    const doc = useDocStore.getState().doc;
    if (!activeId || doc.id !== activeId) return;
    const toSave: DesignDocument = { ...doc, updatedAt: Date.now() };
    // A live project records who saved this version, for the Live indicator on every side.
    if (doc.live) toSave.live = { editedBy: appEditor(deviceId()) };
    set({ saveState: 'saving' });
    try {
      await saveDocument(toSave);
      const projects = upsert(get().projects, metaOf(toSave));
      await saveProjectList(projects);
      set({ projects, saveState: 'saved' });
    } catch (e) {
      console.error('Autosave failed', e);
      set({ saveState: 'error' });
    }
  };

  const watch = () => {
    unsubscribe?.();
    unsubscribe = useDocStore.subscribe((s, prev) => {
      if (s.version === prev.version || s.txn || loadingRemote) return;
      if (s.doc.id !== get().activeId) return;
      if (timer) clearTimeout(timer);
      set({ saveState: 'pending' });
      timer = setTimeout(() => void save(), s.doc.live ? LIVE_AUTOSAVE_DELAY : AUTOSAVE_DELAY);
    });
  };

  const dropLocal = async (id: Id) => {
    if (timer && id === get().activeId) {
      clearTimeout(timer);
      timer = null;
    }
    await deleteDocument(id);
    await deleteFileHandle(id).catch(() => undefined);
    const projects = get().projects.filter((p) => p.id !== id);
    await saveProjectList(projects);
    set({ projects });
    if (id === get().activeId) {
      set({ activeId: null });
      const next = projects[0] ? await loadDocument(projects[0].id) : null;
      if (next) activate(next);
      else await get().create('Untitled');
    }
  };

  return {
    projects: [],
    activeId: null,
    ready: false,
    saveState: 'idle',

    init: async () => {
      await import('@/io/legacy/migrate').then((m) => m.migrateLogoGoOnce()).catch(() => null); // one-time LogoGo import
      const projects = await loadProjectList();
      set({ projects });
      const preferred = getActiveProjectId();
      const candidates = [preferred, ...projects.map((p) => p.id)].filter((x): x is Id => !!x);
      let doc: DesignDocument | null = null;
      for (const id of candidates) {
        doc = await loadDocument(id);
        if (doc) break;
      }
      if (doc) activate(doc);
      else await get().create('Untitled');
      watch();
      set({ ready: true });
    },

    create: async (name = 'Untitled', size) => {
      await get().flush();
      const doc = createDocument({ name });
      if (size) doc.artboard = { ...doc.artboard, width: size.width, height: size.height };
      await saveDocument(doc);
      const projects = upsert(get().projects, metaOf(doc));
      await saveProjectList(projects);
      set({ projects });
      activate(doc);
      return doc.id;
    },

    open: async (id) => {
      if (id === get().activeId) return;
      await get().flush();
      const doc = await loadDocument(id);
      if (doc) activate(doc);
    },

    importDocument: async (incoming) => {
      await get().flush();
      const now = Date.now();
      const doc: DesignDocument = { ...incoming, id: newId('d'), updatedAt: now };
      await saveDocument(doc);
      const projects = upsert(get().projects, metaOf(doc));
      await saveProjectList(projects);
      set({ projects });
      activate(doc);
      return doc.id;
    },

    rename: async (id, name) => {
      const trimmed = name.trim() || 'Untitled';
      if (id === get().activeId) {
        useDocStore.getState().rename(trimmed);
        await save();
        return;
      }
      const doc = await loadDocument(id);
      if (!doc) return;
      const next = { ...doc, name: trimmed, updatedAt: Date.now() };
      await saveDocument(next);
      const projects = upsert(get().projects, metaOf(next));
      await saveProjectList(projects);
      set({ projects });
    },

    duplicate: async (id) => {
      await get().flush();
      const doc = await loadDocument(id);
      if (!doc) return null;
      const now = Date.now();
      const copy: DesignDocument = { ...structuredClone(doc), id: newId('d'), name: `${doc.name} copy`, createdAt: now, updatedAt: now };
      await saveDocument(copy);
      const projects = upsert(get().projects, metaOf(copy));
      await saveProjectList(projects);
      set({ projects });
      return copy.id;
    },

    remove: async (id) => {
      await recordDeletion('projects', id); // so the deletion reaches the other devices
      await dropLocal(id);
    },

    removeRemote: async (id) => {
      if (id === get().activeId && (get().saveState === 'pending' || get().saveState === 'saving')) return false;
      await dropLocal(id);
      return true;
    },

    applyRemote: async (incoming) => {
      const active = incoming.id === get().activeId;
      if (active && (get().saveState === 'pending' || get().saveState === 'saving')) return false;
      await saveDocument(incoming);
      const projects = upsert(get().projects, metaOf(incoming));
      await saveProjectList(projects);
      set({ projects });
      if (active) {
        loadingRemote = true;
        try {
          useDocStore.getState().load(incoming);
        } finally {
          loadingRemote = false;
        }
        // Keep the selection on nodes that still exist: in a live session the agent's edits land while you work.
        const sel = useEditorStore.getState().selection.filter((id) => useDocStore.getState().findNode(id));
        useEditorStore.getState().setSelection(sel);
      }
      return true;
    },

    addConflictedCopy: async (doc, name) => {
      const copy: DesignDocument = { ...structuredClone(doc), id: newId('d'), name, createdAt: doc.createdAt, updatedAt: Date.now() };
      await saveDocument(copy);
      const projects = upsert(get().projects, metaOf(copy));
      await saveProjectList(projects);
      set({ projects });
      return copy.id;
    },

    flush: async () => {
      if (timer) await save();
    },

    stopLive: () => {
      useDocStore.setState((s) => {
        if (!s.doc.live) return s;
        const doc = { ...s.doc };
        delete doc.live;
        return { doc, version: s.version + 1 };
      });
    },
  };
});
