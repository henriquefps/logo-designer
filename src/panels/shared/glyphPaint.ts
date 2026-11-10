import { useDocStore } from '@/store/useDocStore';

export const GLYPH_COLOUR_NOTE =
  'App icons are one colour (white on the tile, themed on Android). Use opacity for depth, and Object → Knock out to hide what’s behind.';

/** True in app icon documents: every paint renders as the one glyph colour (currentColor). */
export const useGlyphPaint = () => useDocStore((s) => !!s.doc.icon);
