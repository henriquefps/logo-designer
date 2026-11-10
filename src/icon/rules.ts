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
/** hfps blue tile. */
export const BRAND = '#2063b0';
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
