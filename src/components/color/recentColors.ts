import { create } from 'zustand';
import { normalizeHex } from '@/model';

// Recent colors (per browser)

const RECENT_KEY = 'designer.recentColors';
const RECENT_MAX = 12;

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && !!normalizeHex(c)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export const useRecentColors = create<{ colors: string[]; push: (c: string) => void }>()((set, get) => ({
  colors: loadRecent(),
  push: (c) => {
    const hex = normalizeHex(c);
    if (!hex) return;
    const colors = [hex, ...get().colors.filter((x) => x !== hex)].slice(0, RECENT_MAX);
    set({ colors });
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(colors));
    } catch {
      /* storage unavailable */
    }
  },
}));
