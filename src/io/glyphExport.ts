// Document → glyph fragment for build-icons.mjs (hfps-kit skill, repo-assets). The CLI (`designer to-svg
// --glyph`, `designer icons`) and the app (File → Export icon) share one exporter:
// src/iconMode/glyph.ts (128 space = the visible tile, every paint → currentColor with its alpha; full-colour icons keep their paints).
export { glyphFragment as exportGlyph } from '@/iconMode/glyph';

export const GLYPH_BOX = 128;
