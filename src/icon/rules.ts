// hfps app icon rules. MIRRORS ~/.agents/skills/hfps-repo-assets/assets/build-icons.mjs (and the
// "The icon: rules" table in that skill's SKILL.md). Every number here must change together with
// that script: the Designer has to produce exactly what the script produces from the same glyph.

/** Keylines: fractions of the visible tile T (long side of the ink box, strokes included). */
export const KEYLINE = {
  circle: { long: 0.64 }, // round glyphs look smaller: a touch larger
  square: { long: 0.6 }, // square-ish glyphs look bigger: a touch smaller
  wide: { long: 0.68, short: 0.46 }, // width cap; height floor (the script warns below it)
  tall: { long: 0.68, short: 0.46 },
} as const;

export type IconShape = keyof typeof KEYLINE;
export type IconShapeArg = IconShape | 'auto';
export const ICON_SHAPES: readonly IconShape[] = ['circle', 'square', 'wide', 'tall'];

/** Favicon glyph at 16-48 px. */
export const SMALL_FILL = 0.76;
/** hfps blue tile (the default; older hfps repos keep their olive `#5b7a3a`: `--tile`). */
export const BRAND = '#2063b0';

/** Validates a tile colour: `#rgb` or `#rrggbb` (any case) -> lowercase `#rrggbb`; null when invalid. */
export function normalizeTile(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return '#' + (h.length === 3 ? [...h].map((c) => c + c).join('') : h);
}
/** Default glyph colour (one-colour mode): white. Stored as "no glyph colour". */
export const GLYPH_DEFAULT = '#ffffff';
export const LIGHT_BORDER = '#d3d4cb';
/** Signal / WhatsApp glyph size, drawn as the pink dashed reference circle. */
export const REFERENCE_CIRCLE = 0.63;
export const REFERENCE_PINK = '#ff4d8d';

/** Tile corner radius in the 128 space: icon.svg / icon.png. */
export const TILE_RX = 28;
/** Favicon tile corner radius (128 space). */
export const FAVICON_RX = 24;
/** Legacy Android ic_launcher corner radius (128 space). */
export const LEGACY_RX = 22;

/** Android adaptive icon: 108dp canvas, visible tile 72dp centred (18 inset), 66dp safe circle. */
export const ANDROID = { canvas: 108, tile: 72, inset: 18, safeRadius: 33 } as const;

/** Ink coverage range (fraction of the tile). */
export const INK_MIN = 0.08;
export const INK_MAX = 0.32;
/**
 * Stroke width, fraction of T, measured AFTER fitting (what the user sees). Target 0.05-0.07 T
 * (6.4-9 units in the 128 space); warn only below 0.045 T (5.76 units). Thick strokes never warn.
 */
export const STROKE_TARGET_MIN = 0.05;
export const STROKE_TARGET_MAX = 0.07;
export const STROKE_WARN_BELOW = 0.045;

/** True when any fitted stroke width (128 space units) is thinner than STROKE_WARN_BELOW. */
export function strokeWarning(fittedWidths: number[]): boolean {
  return fittedWidths.some((w) => w < STROKE_WARN_BELOW * 128);
}

/** Measurement raster: render -64..192 (span 256) at 2048 px so ink outside 0..128 counts too. */
export const MEASURE_PX = 2048;
export const MEASURE_SPAN = 256;
export const MEASURE_ORIGIN = -64;
/** Alpha threshold (0-255) for a pixel to count as ink. */
export const ALPHA_THRESHOLD = 24;

/**
 * iOS 18+ appearances (AppIcon.appiconset) and the iOS 26 Icon Composer file. See
 * docs/app-icons-theming.md for Apple's rules and sources.
 * - Dark: transparent background (the system draws its dark gradient behind it), the glyph in the
 *   brand blue lifted to 62% lightness (HSL 212°, 69%) so it reads on near-black.
 * - Tinted: fully opaque grayscale: white glyph on black (the system tints by luminance).
 */
export const IOS_DARK_GLYPH = '#5b9ae1';
/**
 * The Dark glyph for any tile colour: the tile's hue and saturation (rounded to whole degrees and
 * percent) at 62% HSL lightness. For BRAND `#2063b0` (HSL 212°, 69%, 41%) this is exactly
 * IOS_DARK_GLYPH `#5b9ae1`, so the default is unchanged; for olive `#5b7a3a` it gives `#9fc17b`.
 * MIRRORS darkGlyphFor() in build-icons.mjs.
 */
export function iosDarkGlyphFor(tile: string = BRAND): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(tile.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  h = Math.round(h) % 360;
  s = Math.round(s * 100) / 100;
  const L = 0.62,
    c = (1 - Math.abs(2 * L - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = L - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [R, G, B].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
export const IOS_TINTED_GLYPH = '#ffffff';
export const IOS_TINTED_BG = '#000000';
/** Icon Composer dark background: linear gradient top → bottom, close to iOS's own dark tile. */
export const IOS_DARK_BG = ['#3a3a3c', '#161618'] as const;
/** Icon Composer canvas for iPhone, iPad and Mac (px = pt at scale 1). */
export const ICON_COMPOSER_CANVAS = 1024;
