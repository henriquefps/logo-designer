// Present mode state in the app: a tiny store over the pure state machine in ./present.ts.
import { create } from 'zustand';
import type { ScreenPlatform, WireframeFlow } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { back, follow, startPresent, switchPlatform, type PresentState } from './present';

interface PresentStore {
  /** Null = not presenting. */
  state: PresentState | null;
  enter: () => boolean;
  exit: () => void;
  follow: (flow: Pick<WireframeFlow, 'from' | 'to'>) => void;
  back: () => void;
  setPlatform: (platform: ScreenPlatform) => void;
}

const doc = () => useDocStore.getState().doc;

export const usePresentStore = create<PresentStore>((set, get) => ({
  state: null,
  enter: () => {
    const d = doc();
    if (!d.wireframe) return false;
    const state = startPresent(d, useEditorStore.getState().selection);
    if (!state) return false;
    set({ state });
    return true;
  },
  exit: () => set({ state: null }),
  follow: (flow) => {
    const s = get().state;
    if (s) set({ state: follow(doc(), s, flow) });
  },
  back: () => {
    const s = get().state;
    if (s) set({ state: back(doc(), s) });
  },
  setPlatform: (platform) => {
    const s = get().state;
    if (s) set({ state: switchPlatform(doc(), s, platform) });
  },
}));

/** View → Present: false when the document is not a wireframe or has no screen. */
export const enterPresentMode = () => usePresentStore.getState().enter();
