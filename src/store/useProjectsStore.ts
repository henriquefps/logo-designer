import { create } from 'zustand';
import { createDocument, newId, type DesignDocument, type Id } from '@/model';
import {
  deleteDocument,
  getActiveProjectId,
  loadDocument,
  loadProjectList,
  metaOf,
  saveDocument,
  saveProjectList,
  setActiveProjectId,
  type ProjectMeta,
} from './persistence';
import { useDocStore } from './useDocStore';
import { useEditorStore } from './useEditorStore';

export const AUTOSAVE_DELAY = 600;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface ProjectsState {
  projects: ProjectMeta[];
  activeId: Id | null;
  ready: boolean;
  saveState: SaveState;

  init: () => Promise<void>;
  create: (name?: string) => Promise<Id>;
  open: (id: Id) => Promise<void>;
  /** Adds an existing document (e.g. opened from a project file) as a new project and opens it. */
  importDocument: (doc: DesignDocument) => Promise<Id>;
  rename: (id: Id, name: string) => Promise<void>;
  duplicate: (id: Id) => Promise<Id | null>;
  remove: (id: Id) => Promise<void>;
  /** Saves the active document now (cancels a pending autosave). */
  flush: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function upsert(list: ProjectMeta[], meta: ProjectMeta) {
  return [meta, ...list.filter((p) => p.id !== meta.id)].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useProjectsStore = create<ProjectsState>()((set, get) => {
  const activate = (doc: DesignDocument) => {
    useDocStore.getState().load(doc);
    useEditorStore.getState().setSelection([]);
    setActiveProjectId(doc.id);
    set({ activeId: doc.id });
    // Fit the artboard once the canvas knows its size.
    const { width, height } = doc.artboard;
    useEditorStore.getState().fitRect({ x: 0, y: 0, width, height });
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
      if (s.version === prev.version || s.txn) return;
      if (s.doc.id !== get().activeId) return;
      if (timer) clearTimeout(timer);
      set({ saveState: 'pending' });
      timer = setTimeout(() => void save(), AUTOSAVE_DELAY);
    });
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

    create: async (name = 'Untitled') => {
      await get().flush();
      const doc = createDocument({ name });
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
      if (timer && id === get().activeId) {
        clearTimeout(timer);
        timer = null;
      }
      await deleteDocument(id);
      const projects = get().projects.filter((p) => p.id !== id);
      await saveProjectList(projects);
      set({ projects });
      if (id === get().activeId) {
        set({ activeId: null });
        const next = projects[0] ? await loadDocument(projects[0].id) : null;
        if (next) activate(next);
        else await get().create('Untitled');
      }
    },

    flush: async () => {
      if (timer) await save();
    },
  };
});
