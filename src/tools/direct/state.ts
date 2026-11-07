import { create } from 'zustand';
import type { Id } from '@/model';

/** Node-edit (direct select) UI state: selected anchors of the edited path ("s:i" keys). */
interface NodeEditState {
  selected: string[];
  /** Shape waiting for "Convert to path?" confirmation before node editing. */
  pendingConvert: Id | null;
  setSelected: (keys: string[]) => void;
}

export const useNodeEdit = create<NodeEditState>()((set) => ({
  selected: [],
  pendingConvert: null,
  setSelected: (selected) => set({ selected: [...new Set(selected)] }),
}));
