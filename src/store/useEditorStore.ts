import { create } from 'zustand';
import type { Id, Rect, Vec } from '@/model';

export type PanelTab = 'properties' | 'layers' | 'assets';

export interface SnapGuide {
  axis: 'x' | 'y';
  /** World coordinate of the guide line (drawn across the whole viewport). */
  position: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export interface EditorState {
  tool: string;
  /** Tool to return to after a temporary one (e.g. Space → hand). */
  previousTool: string | null;
  selection: Id[];
  hover: Id | null;
  zoom: number;
  /** Screen offset (px) of the document origin inside the canvas viewport. */
  pan: Vec;
  viewport: Viewport;
  cursor: string;
  /** Last pointer position in document coords (status bar). */
  pointer: Vec | null;
  editingPathId: Id | null;
  editingTextId: Id | null;
  panelTab: PanelTab;
  snapping: boolean;
  guides: SnapGuide[];
  marquee: Rect | null;
  /** Open dialogs by id (projects, shortcuts, about, export…). */
  dialog: string | null;
  mobilePanelOpen: boolean;
  /** Space held: temporary hand tool. */
  spacePan: boolean;

  setTool: (id: string) => void;
  setSelection: (ids: Id[]) => void;
  toggleSelection: (id: Id) => void;
  clearSelection: () => void;
  setHover: (id: Id | null) => void;
  setZoom: (zoom: number, anchor?: Vec) => void;
  setPan: (pan: Vec) => void;
  setViewport: (v: Viewport) => void;
  setCursor: (cursor: string) => void;
  setPointer: (p: Vec | null) => void;
  setEditingPath: (id: Id | null) => void;
  setEditingText: (id: Id | null) => void;
  setPanelTab: (tab: PanelTab) => void;
  setSnapping: (on: boolean) => void;
  setGuides: (g: SnapGuide[]) => void;
  setMarquee: (r: Rect | null) => void;
  openDialog: (id: string | null) => void;
  setMobilePanelOpen: (open: boolean) => void;
  setSpacePan: (on: boolean) => void;
  /** Fits a document-space rect into the viewport. */
  fitRect: (r: Rect, padding?: number) => void;
  screenToDoc: (p: Vec) => Vec;
  docToScreen: (p: Vec) => Vec;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  tool: 'select',
  previousTool: null,
  selection: [],
  hover: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  viewport: { width: 0, height: 0 },
  cursor: 'default',
  pointer: null,
  editingPathId: null,
  editingTextId: null,
  panelTab: 'properties',
  snapping: true,
  guides: [],
  marquee: null,
  dialog: null,
  mobilePanelOpen: false,
  spacePan: false,

  setTool: (id) => set((s) => (s.tool === id ? s : { tool: id, previousTool: s.tool })),
  setSelection: (ids) => set({ selection: [...new Set(ids)] }),
  toggleSelection: (id) =>
    set((s) => ({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] })),
  clearSelection: () => set({ selection: [] }),
  setHover: (hover) => set((s) => (s.hover === hover ? s : { hover })),
  setZoom: (zoom, anchor) => {
    const { zoom: old, pan, viewport } = get();
    const z = clampZoom(zoom);
    const a = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 };
    // Keep the document point under `anchor` fixed on screen.
    const k = z / old;
    set({ zoom: z, pan: { x: a.x - (a.x - pan.x) * k, y: a.y - (a.y - pan.y) * k } });
  },
  setPan: (pan) => set({ pan }),
  setViewport: (viewport) => set({ viewport }),
  setCursor: (cursor) => set((s) => (s.cursor === cursor ? s : { cursor })),
  setPointer: (pointer) => set({ pointer }),
  setEditingPath: (editingPathId) => set({ editingPathId }),
  setEditingText: (editingTextId) => set({ editingTextId }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setSnapping: (snapping) => set({ snapping }),
  setGuides: (guides) => set((s) => (s.guides.length === 0 && guides.length === 0 ? s : { guides })),
  setMarquee: (marquee) => set({ marquee }),
  openDialog: (dialog) => set({ dialog }),
  setMobilePanelOpen: (mobilePanelOpen) => set({ mobilePanelOpen }),
  setSpacePan: (spacePan) => set((s) => (s.spacePan === spacePan ? s : { spacePan })),
  fitRect: (r, padding = 48) => {
    const { viewport } = get();
    if (!viewport.width || !viewport.height || !r.width || !r.height) return;
    const zoom = clampZoom(Math.min((viewport.width - padding * 2) / r.width, (viewport.height - padding * 2) / r.height));
    set({
      zoom,
      pan: {
        x: viewport.width / 2 - (r.x + r.width / 2) * zoom,
        y: viewport.height / 2 - (r.y + r.height / 2) * zoom,
      },
    });
  },
  screenToDoc: (p) => {
    const { zoom, pan } = get();
    return { x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom };
  },
  docToScreen: (p) => {
    const { zoom, pan } = get();
    return { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y };
  },
}));
