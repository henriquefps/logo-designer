import { create } from 'zustand';
import { DEFAULT_FILL_COLOR } from '@/model/factories';
import type { IconSource, PhosphorWeight } from './catalog';

const FAV_KEY = 'designer.icons.favorites';
const REC_KEY = 'designer.icons.recents';
const MAX_RECENTS = 48;

const read = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const write = (key: string, v: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full / disabled */
  }
};

/** Pure helpers (tested). Keys look like "lucide:Heart" or "iconify:mdi:home". */
export const toggleKey = (list: string[], key: string): string[] => (list.includes(key) ? list.filter((k) => k !== key) : [key, ...list]);
export const pushRecentKey = (list: string[], key: string, max = MAX_RECENTS): string[] => [key, ...list.filter((k) => k !== key)].slice(0, max);

interface IconPrefs {
  favorites: string[];
  recents: string[];
  toggleFavorite: (key: string) => void;
  pushRecent: (key: string) => void;
}

export const useIconPrefs = create<IconPrefs>((set, get) => ({
  favorites: read(FAV_KEY),
  recents: read(REC_KEY),
  toggleFavorite: (key) => {
    const favorites = toggleKey(get().favorites, key);
    write(FAV_KEY, favorites);
    set({ favorites });
  },
  pushRecent: (key) => {
    const recents = pushRecentKey(get().recents, key);
    write(REC_KEY, recents);
    set({ recents });
  },
}));

/** Quick options applied when an icon is inserted. */
interface IconOptions {
  source: IconSource;
  collection: string | null;
  color: string;
  /** null = 25% of the artboard */
  size: number | null;
  /** In icon units; null keeps the icon's own stroke width. */
  strokeWidth: number | null;
  weight: PhosphorWeight;
  set: (patch: Partial<Omit<IconOptions, 'set'>>) => void;
}

export const useIconOptions = create<IconOptions>((set) => ({
  source: 'lucide',
  collection: null,
  color: DEFAULT_FILL_COLOR,
  size: null,
  strokeWidth: null,
  weight: 'regular',
  set: (patch) => set(patch),
}));
