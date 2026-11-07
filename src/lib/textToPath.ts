import type opentype from 'opentype.js';
import type { ConvertResult } from '@/lib/convertToPath';
import type { TextElement } from '@/types/element';
import interTtfUrl from '@/assets/fonts-ttf/inter-variable.ttf?url';
import spaceGroteskTtfUrl from '@/assets/fonts-ttf/space-grotesk-variable.ttf?url';
import playfairDisplayTtfUrl from '@/assets/fonts-ttf/playfair-display-variable.ttf?url';
import jetbrainsMonoTtfUrl from '@/assets/fonts-ttf/jetbrains-mono-variable.ttf?url';
import bebasNeueTtfUrl from '@/assets/fonts-ttf/bebas-neue-regular.ttf?url';

/**
 * A second copy of each bundled font, as plain TrueType (not woff2) — used only for "convert
 * text to path", never for on-page rendering (the app's own CSS still uses the @fontsource woff2
 * files for that). opentype.js can't read woff2 itself (it's Brotli-compressed) and the one
 * browser-targeted woff2 decompressor tried here (`wawoff2`, a compiled-to-wasm library) never
 * completed initialization in this Vite dev/build setup — its decompress() call just hung
 * forever with no error, confirmed via direct testing. Sourced from Google's official
 * google/fonts OFL repo, i.e. the exact same open-license fonts already vendored via
 * @fontsource, just in a container opentype.js can parse directly.
 */
const TEXT_FONT_FILES: Record<string, { url: string; variable: boolean }> = {
  'Inter Variable': { url: interTtfUrl, variable: true },
  'Space Grotesk Variable': { url: spaceGroteskTtfUrl, variable: true },
  'Playfair Display Variable': { url: playfairDisplayTtfUrl, variable: true },
  'JetBrains Mono Variable': { url: jetbrainsMonoTtfUrl, variable: true },
  'Bebas Neue': { url: bebasNeueTtfUrl, variable: false },
};

async function getOpentypeLib() {
  const mod = await import('opentype.js');
  return (mod as unknown as { default?: typeof opentype }).default ?? (mod as unknown as typeof opentype);
}

const parsedFontCache = new Map<string, Promise<opentype.Font | null>>();

function loadFont(opentypeLib: typeof opentype, family: string): Promise<opentype.Font | null> {
  let cached = parsedFontCache.get(family);
  if (!cached) {
    cached = (async () => {
      const fontFile = TEXT_FONT_FILES[family];
      if (!fontFile) return null;
      const res = await fetch(fontFile.url);
      const buffer = await res.arrayBuffer();
      return opentypeLib.parse(buffer);
    })();
    parsedFontCache.set(family, cached);
  }
  return cached;
}

/**
 * Converts a text element into real glyph outlines, centered on the element's own origin (0,0)
 * the same way the rendered <text textAnchor="middle" dominantBaseline="central"> is.
 *
 * Deliberately bypasses opentype.js's high-level shaping API (Font#getPath) and walks glyphs one
 * at a time instead: opentype.js 2.0's GSUB/ccmp handling throws ("substFormat: 2 is not yet
 * supported") on Inter's ligature table when going through the shaping path, unconditionally,
 * with no option to disable it. Per-glyph iteration (still with real kerning and variable-weight
 * instancing) sidesteps that broken code path entirely — the cost is no ligatures/contextual
 * substitution, a fair trade for short logo/label text.
 */
export async function convertTextToPathGeometry(element: TextElement): Promise<ConvertResult | null> {
  const opentypeLib = await getOpentypeLib();
  const font = await loadFont(opentypeLib, element.fontFamily);
  if (!font) return null;

  const variation = { variation: { wght: Number(element.fontWeight) || 400 } };
  const scale = element.size / font.unitsPerEm;
  const path = new opentypeLib.Path();
  let cursorX = 0;
  let prevGlyph: opentype.Glyph | null = null;
  for (const char of Array.from(element.text)) {
    const glyph = font.charToGlyph(char);
    if (prevGlyph) cursorX += font.getKerningValue(prevGlyph, glyph) * scale;
    path.extend(glyph.getPath(cursorX, 0, element.size, variation, font));
    cursorX += glyph.advanceWidth * scale;
    prevGlyph = glyph;
  }
  if (path.commands.length === 0) return null;

  // Center on the glyphs' own ink bounding box — visually matches the rendered
  // textAnchor="middle"/dominantBaseline="central" <text> closely without needing to replicate
  // the browser's own font-metric-based centering algorithm.
  const bbox = path.getBoundingBox();
  const centerX = (bbox.x1 + bbox.x2) / 2;
  const centerY = (bbox.y1 + bbox.y2) / 2;
  for (const cmd of path.commands) {
    if ('x' in cmd) cmd.x -= centerX;
    if ('y' in cmd) cmd.y -= centerY;
    if ('x1' in cmd) cmd.x1 -= centerX;
    if ('y1' in cmd) cmd.y1 -= centerY;
    if ('x2' in cmd) cmd.x2 -= centerX;
    if ('y2' in cmd) cmd.y2 -= centerY;
  }

  return {
    width: bbox.x2 - bbox.x1,
    height: bbox.y2 - bbox.y1,
    pathData: path.toPathData(3),
    fill: element.color,
    stroke: element.color,
    strokeWidth: 0,
  };
}
