// Document → glyph fragment for build-icons.mjs (hfps-repo-assets skill). The CLI (`designer to-svg
// --glyph`, `designer icons`) and the app (File → Export icon) share one exporter:
// src/iconMode/glyph.ts (128 space = the visible tile, every paint → currentColor with its alpha).
export { glyphFragment as exportGlyph } from '@/iconMode/glyph';

export const GLYPH_BOX = 128;
