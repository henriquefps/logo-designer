import { useDocStore } from '@/store/useDocStore';

export const GLYPH_COLOUR_NOTE =
  'One-colour icon: every shape is the glyph colour (set in the Icon panel; themed on Android). Use opacity for depth, and Object → Knock out to hide what’s behind. For per-shape colours or gradients, switch the Icon panel to Full colour.';

/** True in one-colour app icon documents: every paint renders as the one glyph colour (currentColor). Full-colour icons edit paints as usual. */
export const useGlyphPaint = () => useDocStore((s) => !!s.doc.icon && s.doc.icon.colour !== 'full-colour');
