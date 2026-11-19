import { create } from 'zustand';
import type { ScreenPlatform } from '@/model';

/** Platform the Screen tool (F) places. */
export const useScreenToolPrefs = create<{ platform: ScreenPlatform; setPlatform: (p: ScreenPlatform) => void }>()((set) => ({
  platform: 'phone',
  setPlatform: (platform) => set({ platform }),
}));
