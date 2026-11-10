import { create } from 'zustand';
import type { InkBox, IconReport } from '@/icon';
import { DEFAULT_TINT } from './themedPreview';

/** Icon view preferences (per browser, not in the document). */
interface IconPrefs {
  /** Keyline guides over the canvas. */
  showKeylines: boolean;
  /** Brand tile drawn under the glyph (a reference: never exported as part of the glyph). */
  showTile: boolean;
  /** Light variant: white tile with a border and the glyph in brand blue. */
  light: boolean;
  /** Tint / wallpaper accent for the approximate system-theme previews (iOS Tinted, Android themed). */
  tint: string;
}

const KEY = 'designer.icon';
const DEFAULTS: IconPrefs = { showKeylines: true, showTile: true, light: false, tint: DEFAULT_TINT };

function load(): IconPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object')
      return {
        showKeylines: v.showKeylines !== false,
        showTile: v.showTile !== false,
        light: v.light === true,
        tint: typeof v.tint === 'string' && /^#[0-9a-f]{6}$/i.test(v.tint) ? v.tint : DEFAULT_TINT,
      };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export interface IconAnalysis {
  status: 'idle' | 'measuring' | 'ready' | 'empty' | 'error';
  /** Glyph fragment that was measured (128 space, currentColor). */
  glyph: string;
  /** Ink box of the glyph as it sits on the canvas (128 space = the visible tile). */
  box: InkBox | null;
  report: IconReport | null;
  /** Stroke widths in the 128 space as drawn (before the fit). */
  strokes: number[];
  error?: string;
}

interface IconState extends IconPrefs {
  analysis: IconAnalysis;
  setPrefs: (patch: Partial<IconPrefs>) => void;
  setAnalysis: (a: IconAnalysis) => void;
}

export const EMPTY_ANALYSIS: IconAnalysis = { status: 'idle', glyph: '', box: null, report: null, strokes: [] };

export const useIconStore = create<IconState>()((set, get) => ({
  ...load(),
  analysis: EMPTY_ANALYSIS,
  setPrefs: (patch) => {
    set(patch);
    const { showKeylines, showTile, light, tint } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ showKeylines, showTile, light, tint }));
    } catch {
      /* storage unavailable */
    }
  },
  setAnalysis: (analysis) => set({ analysis }),
}));
