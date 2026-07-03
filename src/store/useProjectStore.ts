import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createId } from '@/lib/id';
import { debouncedLocalStorage } from '@/lib/storage/persistStorage';
import { migrateLegacyStorage } from '@/lib/storage/migrateLegacyStorage';
import { DEFAULT_CANVAS_SETTINGS, type CanvasSettings } from '@/types/canvas';
import type { LogoElement } from '@/types/element';
import type { Project } from '@/types/project';

const STORAGE_KEY = 'logogo-project-storage';
const HISTORY_LIMIT = 50;

interface HistorySnapshot {
  canvasSettings: CanvasSettings;
  elements: LogoElement[];
}

interface HistoryState {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

interface ProjectStoreState {
  version: 2;
  projects: Record<string, Project>;
  projectOrder: string[];
  activeProjectId: string | null;
  history: Record<string, HistoryState>;
  historyPending: Record<string, HistorySnapshot | undefined>;

  createProject: (opts?: { name?: string; canvasSettings?: CanvasSettings; elements?: LogoElement[] }) => string;
  duplicateProject: (id: string) => string;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;

  addElement: (element: LogoElement) => void;
  updateElement: (id: string, patch: Partial<LogoElement>) => void;
  updateElements: (ids: string[], patch: Partial<LogoElement>) => void;
  setElementPositions: (positions: { id: string; x: number; y: number }[]) => void;
  removeElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => string[];
  reorderElement: (id: string, dir: 'up' | 'down' | 'front' | 'back') => void;
  setCanvasSettings: (patch: Partial<CanvasSettings>) => void;

  beginGesture: () => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function createDefaultElements(): LogoElement[] {
  return [
    {
      id: createId(),
      type: 'icon',
      iconType: 'lucide',
      name: 'Hexagon',
      x: 256,
      y: 256,
      size: 220,
      color: '#f4f1ea',
      strokeWidth: 1.5,
      rotation: 0,
      opacity: 25,
      flipH: false,
      flipV: false,
      locked: false,
    },
    {
      id: createId(),
      type: 'icon',
      iconType: 'lucide',
      name: 'PenTool',
      x: 256,
      y: 256,
      size: 100,
      color: '#f4f1ea',
      strokeWidth: 2.2,
      rotation: -15,
      opacity: 100,
      flipH: false,
      flipV: false,
      locked: false,
    },
    {
      id: createId(),
      type: 'text',
      text: 'LogoGo',
      x: 256,
      y: 410,
      size: 42,
      color: '#f4f1ea',
      fontFamily: 'Inter Variable',
      fontWeight: '800',
      rotation: 0,
      opacity: 100,
      flipH: false,
      flipV: false,
      locked: false,
    },
  ];
}

function createProjectObject(name: string, canvasSettings: CanvasSettings, elements: LogoElement[]): Project {
  const now = Date.now();
  return { id: createId(), name, createdAt: now, updatedAt: now, canvasSettings, elements };
}

function buildInitialState(): Pick<ProjectStoreState, 'projects' | 'projectOrder' | 'activeProjectId'> {
  const hasPersisted = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== null;

  if (!hasPersisted) {
    const migrated = typeof window !== 'undefined' ? migrateLegacyStorage() : null;
    const project = migrated ?? createProjectObject('My Logo', DEFAULT_CANVAS_SETTINGS, createDefaultElements());
    return { projects: { [project.id]: project }, projectOrder: [project.id], activeProjectId: project.id };
  }

  // Persisted data exists — persist middleware will hydrate over this; keep it valid but empty-safe.
  return { projects: {}, projectOrder: [], activeProjectId: null };
}

export const useProjectStore = create<ProjectStoreState>()(
  persist(
    (set, get) => ({
      version: 2,
      ...buildInitialState(),
      history: {},
      historyPending: {},

      createProject: (opts) => {
        const project = createProjectObject(
          opts?.name ?? 'Untitled Logo',
          opts?.canvasSettings ?? DEFAULT_CANVAS_SETTINGS,
          opts?.elements ?? [],
        );
        set((state) => ({
          projects: { ...state.projects, [project.id]: project },
          projectOrder: [...state.projectOrder, project.id],
          activeProjectId: project.id,
        }));
        return project.id;
      },

      duplicateProject: (id) => {
        const source = get().projects[id];
        if (!source) return id;
        const copy = createProjectObject(`${source.name} copy`, source.canvasSettings, source.elements.map((el) => ({ ...el, id: createId() })));
        set((state) => ({
          projects: { ...state.projects, [copy.id]: copy },
          projectOrder: [...state.projectOrder, copy.id],
          activeProjectId: copy.id,
        }));
        return copy.id;
      },

      renameProject: (id, name) => {
        set((state) => {
          const project = state.projects[id];
          if (!project) return state;
          return { projects: { ...state.projects, [id]: { ...project, name, updatedAt: Date.now() } } };
        });
      },

      deleteProject: (id) => {
        set((state) => {
          if (state.projectOrder.length <= 1) return state;
          const projectOrder = state.projectOrder.filter((pid) => pid !== id);
          const projects = { ...state.projects };
          delete projects[id];
          const history = { ...state.history };
          delete history[id];
          const activeProjectId = state.activeProjectId === id ? projectOrder[0] : state.activeProjectId;
          return { projects, projectOrder, activeProjectId, history };
        });
      },

      switchProject: (id) => {
        set((state) => (state.projects[id] ? { activeProjectId: id } : state));
      },

      addElement: (element) => {
        const id = get().activeProjectId;
        if (!id) return;
        get().beginGesture();
        set((state) => {
          const project = state.projects[id];
          return { projects: { ...state.projects, [id]: { ...project, elements: [...project.elements, element], updatedAt: Date.now() } } };
        });
        get().commit();
      },

      updateElement: (elementId, patch) => {
        const id = get().activeProjectId;
        if (!id) return;
        set((state) => {
          const project = state.projects[id];
          return {
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                elements: project.elements.map((el) => (el.id === elementId ? ({ ...el, ...patch } as LogoElement) : el)),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      updateElements: (elementIds, patch) => {
        const id = get().activeProjectId;
        if (!id) return;
        const idSet = new Set(elementIds);
        set((state) => {
          const project = state.projects[id];
          return {
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                elements: project.elements.map((el) => (idSet.has(el.id) ? ({ ...el, ...patch } as LogoElement) : el)),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setElementPositions: (positions) => {
        const id = get().activeProjectId;
        if (!id) return;
        const positionMap = new Map(positions.map((p) => [p.id, p]));
        set((state) => {
          const project = state.projects[id];
          return {
            projects: {
              ...state.projects,
              [id]: {
                ...project,
                elements: project.elements.map((el) => {
                  const pos = positionMap.get(el.id);
                  return pos ? { ...el, x: pos.x, y: pos.y } : el;
                }),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      removeElements: (elementIds) => {
        const id = get().activeProjectId;
        if (!id) return;
        const idSet = new Set(elementIds);
        get().beginGesture();
        set((state) => {
          const project = state.projects[id];
          return {
            projects: { ...state.projects, [id]: { ...project, elements: project.elements.filter((el) => !idSet.has(el.id)), updatedAt: Date.now() } },
          };
        });
        get().commit();
      },

      duplicateElements: (elementIds) => {
        const id = get().activeProjectId;
        if (!id) return [];
        const idSet = new Set(elementIds);
        const newIds: string[] = [];
        get().beginGesture();
        set((state) => {
          const project = state.projects[id];
          const copies = project.elements
            .filter((el) => idSet.has(el.id))
            .map((el) => {
              const newId = createId();
              newIds.push(newId);
              return { ...el, id: newId, x: el.x + 16, y: el.y + 16 } as LogoElement;
            });
          return { projects: { ...state.projects, [id]: { ...project, elements: [...project.elements, ...copies], updatedAt: Date.now() } } };
        });
        get().commit();
        return newIds;
      },

      reorderElement: (elementId, dir) => {
        const id = get().activeProjectId;
        if (!id) return;
        get().beginGesture();
        set((state) => {
          const project = state.projects[id];
          const index = project.elements.findIndex((el) => el.id === elementId);
          if (index === -1) return state;
          const elements = [...project.elements];
          const [item] = elements.splice(index, 1);
          if (dir === 'up') elements.splice(Math.min(index + 1, elements.length), 0, item);
          else if (dir === 'down') elements.splice(Math.max(index - 1, 0), 0, item);
          else if (dir === 'front') elements.push(item);
          else elements.unshift(item);
          return { projects: { ...state.projects, [id]: { ...project, elements, updatedAt: Date.now() } } };
        });
        get().commit();
      },

      setCanvasSettings: (patch) => {
        const id = get().activeProjectId;
        if (!id) return;
        set((state) => {
          const project = state.projects[id];
          return { projects: { ...state.projects, [id]: { ...project, canvasSettings: { ...project.canvasSettings, ...patch }, updatedAt: Date.now() } } };
        });
      },

      beginGesture: () => {
        const id = get().activeProjectId;
        if (!id) return;
        set((state) => {
          if (state.historyPending[id]) return state;
          const project = state.projects[id];
          if (!project) return state;
          return {
            historyPending: {
              ...state.historyPending,
              [id]: { canvasSettings: project.canvasSettings, elements: project.elements },
            },
          };
        });
      },

      commit: () => {
        const id = get().activeProjectId;
        if (!id) return;
        set((state) => {
          const pending = state.historyPending[id];
          if (!pending) return state;
          const existing = state.history[id] ?? { past: [], future: [] };
          return {
            history: {
              ...state.history,
              [id]: { past: [...existing.past, pending].slice(-HISTORY_LIMIT), future: [] },
            },
            historyPending: { ...state.historyPending, [id]: undefined },
          };
        });
      },

      undo: () => {
        const id = get().activeProjectId;
        if (!id) return;
        set((state) => {
          const existing = state.history[id];
          if (!existing || existing.past.length === 0) return state;
          const project = state.projects[id];
          const previous = existing.past[existing.past.length - 1];
          const currentSnapshot: HistorySnapshot = { canvasSettings: project.canvasSettings, elements: project.elements };
          return {
            projects: { ...state.projects, [id]: { ...project, canvasSettings: previous.canvasSettings, elements: previous.elements, updatedAt: Date.now() } },
            history: {
              ...state.history,
              [id]: { past: existing.past.slice(0, -1), future: [currentSnapshot, ...existing.future] },
            },
          };
        });
      },

      redo: () => {
        const id = get().activeProjectId;
        if (!id) return;
        set((state) => {
          const existing = state.history[id];
          if (!existing || existing.future.length === 0) return state;
          const project = state.projects[id];
          const next = existing.future[0];
          const currentSnapshot: HistorySnapshot = { canvasSettings: project.canvasSettings, elements: project.elements };
          return {
            projects: { ...state.projects, [id]: { ...project, canvasSettings: next.canvasSettings, elements: next.elements, updatedAt: Date.now() } },
            history: {
              ...state.history,
              [id]: { past: [...existing.past, currentSnapshot], future: existing.future.slice(1) },
            },
          };
        });
      },

      canUndo: () => {
        const id = get().activeProjectId;
        if (!id) return false;
        return (get().history[id]?.past.length ?? 0) > 0;
      },

      canRedo: () => {
        const id = get().activeProjectId;
        if (!id) return false;
        return (get().history[id]?.future.length ?? 0) > 0;
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => debouncedLocalStorage),
      partialize: (state) => ({
        version: state.version,
        projects: state.projects,
        projectOrder: state.projectOrder,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

export function useActiveProject(): Project | null {
  return useProjectStore((state) => (state.activeProjectId ? state.projects[state.activeProjectId] ?? null : null));
}
