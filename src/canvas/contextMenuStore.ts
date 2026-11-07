import { create } from 'zustand';

/** Right-click menu position (viewport px), null when closed. */
export const useContextMenu = create<{ at: { x: number; y: number } | null; set: (at: { x: number; y: number } | null) => void }>()((set) => ({
  at: null,
  set: (at) => set({ at }),
}));
