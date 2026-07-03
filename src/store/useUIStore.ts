import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';

export type EditorTab = 'background' | 'add' | 'layers' | 'export';
export type DrawTool = 'select' | 'rectangle' | 'ellipse' | 'line' | 'pen';

interface UIStoreState {
  selectedIds: string[];
  hoveredId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  activeTab: EditorTab;
  /** 'select' is the normal pointer mode; anything else arms a shape-drawing tool. */
  activeTool: DrawTool;
  theme: Theme;
  favoriteIcons: string[];
  recentIcons: string[];
  /** Measured (getBBox) sizes for text elements, keyed by element id. Ephemeral, not persisted. */
  textSizes: Record<string, { width: number; height: number }>;
  mobilePanelOpen: boolean;

  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;
  setHovered: (id: string | null) => void;

  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (pan: { x: number; y: number }) => void;
  resetView: () => void;

  setActiveTab: (tab: EditorTab) => void;
  setActiveTool: (tool: DrawTool) => void;
  setTheme: (theme: Theme) => void;
  toggleFavoriteIcon: (iconKey: string) => void;
  pushRecentIcon: (iconKey: string) => void;
  setTextSize: (id: string, width: number, height: number) => void;
  setMobilePanelOpen: (open: boolean) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const MAX_RECENT_ICONS = 24;

export const useUIStore = create<UIStoreState>()(
  persist(
    (set) => ({
      selectedIds: [],
      hoveredId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      activeTab: 'add',
      activeTool: 'select',
      theme: getStoredTheme(),
      favoriteIcons: [],
      recentIcons: [],
      textSizes: {},
      mobilePanelOpen: false,

      setSelection: (ids) => set({ selectedIds: ids }),
      toggleSelection: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id) ? state.selectedIds.filter((i) => i !== id) : [...state.selectedIds, id],
        })),
      addToSelection: (id) => set((state) => (state.selectedIds.includes(id) ? state : { selectedIds: [...state.selectedIds, id] })),
      clearSelection: () => set({ selectedIds: [] }),
      selectAll: (ids) => set({ selectedIds: ids }),
      setHovered: (id) => set({ hoveredId: id }),

      setZoom: (zoom) =>
        set((state) => ({
          zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, typeof zoom === 'function' ? zoom(state.zoom) : zoom)),
        })),
      setPan: (pan) => set({ pan }),
      resetView: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),

      setActiveTab: (tab) => set({ activeTab: tab }),
      setActiveTool: (tool) => set({ activeTool: tool }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleFavoriteIcon: (iconKey) =>
        set((state) => ({
          favoriteIcons: state.favoriteIcons.includes(iconKey)
            ? state.favoriteIcons.filter((k) => k !== iconKey)
            : [...state.favoriteIcons, iconKey],
        })),
      pushRecentIcon: (iconKey) =>
        set((state) => ({
          recentIcons: [iconKey, ...state.recentIcons.filter((k) => k !== iconKey)].slice(0, MAX_RECENT_ICONS),
        })),
      setTextSize: (id, width, height) =>
        set((state) => (state.textSizes[id]?.width === width && state.textSizes[id]?.height === height ? state : { textSizes: { ...state.textSizes, [id]: { width, height } } })),
      setMobilePanelOpen: (open) => set({ mobilePanelOpen: open }),
    }),
    {
      name: 'logogo-ui-storage',
      partialize: (state) => ({ theme: state.theme, favoriteIcons: state.favoriteIcons, recentIcons: state.recentIcons }),
    },
  ),
);
