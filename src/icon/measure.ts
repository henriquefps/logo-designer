// Ink-box measurement, shape detection, fit and the console report of build-icons.mjs.
// MIRRORS ~/.agents/skills/hfps-repo-assets/assets/build-icons.mjs: change both together.
// Pure: rasterization is injected (browser: offscreen canvas; tests: @resvg/resvg-js).
import {
  ALPHA_THRESHOLD,
  ANDROID,
  INK_MAX,
  INK_MIN,
  KEYLINE,
  MEASURE_ORIGIN,
  MEASURE_PX,
  MEASURE_SPAN,
  SMALL_FILL,
  type IconShape,
  type IconShapeArg,
} from './rules';

/** RGBA (or any `channels`) pixels of a `px` × `px` raster; alpha is the last channel of 4. */
export interface Raster {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels: number;
}

/** Renders a standalone SVG string to pixels at `px` × `px`. */
export type Rasterize = (svg: string, px: number) => Promise<Raster>;

/** Ink box in the glyph's own 128 units, plus its ink area (units²). */
export interface InkBox {
  x: number;
  y: number;
  w: number;
  h: number;
  inkArea: number;
}

/** Strips comments and trims, like the script does when it reads a glyph file. */
export const cleanGlyph = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').trim();

/** The SVG the script measures: the glyph over -64..192 at 2048 px, currentColor → black. */
export function measureSvg(src: string, px = MEASURE_PX): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MEASURE_ORIGIN} ${MEASURE_ORIGIN} ${MEASURE_SPAN} ${MEASURE_SPAN}" width="${px}" height="${px}">${src.replaceAll('currentColor', '#000')}</svg>`;
}

/** Ink box from a measurement raster (alpha > 24 counts, weighted by alpha for the area). */
export function inkBoxFromRaster(r: Raster, span = MEASURE_SPAN, origin = MEASURE_ORIGIN): InkBox | null {
  const px = r.width;
  const { data, channels } = r;
  let x0 = px,
    y0 = r.height,
    x1 = -1,
    y1 = -1,
    ink = 0;
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < px; x++) {
      const a = data[(y * px + x) * channels + 3];
      if (a > ALPHA_THRESHOLD) {
        ink += a / 255;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 < 0) return null;
  const u = span / px;
  return { x: x0 * u + origin, y: y0 * u + origin, w: (x1 - x0 + 1) * u, h: (y1 - y0 + 1) * u, inkArea: ink * u * u };
}

/** Measures a glyph fragment (128 space, currentColor). Null when it has no visible ink. */
export async function inkBox(src: string, rasterize: Rasterize, px = MEASURE_PX): Promise<InkBox | null> {
  return inkBoxFromRaster(await rasterize(measureSvg(cleanGlyph(src), px), px));
}

/** auto: aspect ratio >= 1.2 is wide, <= 0.83 tall, else square. Circle only when asked. */
export function shapeOf(box: Pick<InkBox, 'w' | 'h'>, arg: IconShapeArg = 'auto'): IconShape {
  if (arg !== 'auto') return arg;
  const r = box.w / box.h;
  return r >= 1.2 ? 'wide' : r <= 0.83 ? 'tall' : 'square';
}

export interface Fit {
  s: number;
  tx: number;
  ty: number;
  attr: string;
}

/** Transform that centres the ink box in a tile of size T at (ox, oy), long side = fill · T. */
export function fit(box: InkBox, T: number, fill: number, ox = 0, oy = 0): Fit {
  const s = (fill * T) / Math.max(box.w, box.h);
  const tx = ox + T / 2 - (box.x + box.w / 2) * s;
  const ty = oy + T / 2 - (box.y + box.h / 2) * s;
  return { s, tx, ty, attr: `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)})` };
}

/** Favicon fill: SMALL_FILL with a dedicated small glyph, else min(SMALL_FILL, long + 0.08). */
export const faviconFill = (shape: IconShape, hasSmall: boolean) => (hasSmall ? SMALL_FILL : Math.min(SMALL_FILL, KEYLINE[shape].long + 0.08));

export interface IconReport {
  shape: IconShape;
  /** Keyline long side (fraction of T). */
  long: number;
  /** Glyph size as fractions of T after the fit. */
  w: number;
  h: number;
  /** Ink coverage of the tile (0..1). */
  coverage: number;
  /** Android foreground: half the glyph's diagonal in dp (safe ≤ 33). */
  halfDiag: number;
  /** Lines exactly as the script prints them (warnings start with two spaces and "!"). */
  lines: string[];
  warnings: string[];
}

/** The script's numbers and warnings for a measured glyph. */
export function report(box: InkBox, shapeArg: IconShapeArg = 'auto'): IconReport {
  const shape = shapeOf(box, shapeArg);
  const KL = KEYLINE[shape];
  const s128 = fit(box, 128, KL.long).s;
  const w = (box.w * s128) / 128,
    h = (box.h * s128) / 128;
  const coverage = (box.inkArea * s128 * s128) / (128 * 128);
  const fgS = fit(box, ANDROID.tile, KL.long, ANDROID.inset, ANDROID.inset).s;
  const halfDiag = Math.hypot(box.w * fgS, box.h * fgS) / 2;
  const warnings: string[] = [];
  if ((shape === 'wide' || shape === 'tall') && 'short' in KL && Math.min(w, h) < KL.short)
    warnings.push(`  ! short side ${(Math.min(w, h) * 100).toFixed(0)}% < ${KL.short * 100}%: the glyph is too thin for its tile, redraw it chunkier`);
  if (coverage < INK_MIN) warnings.push('  ! ink under 8%: strokes too thin or glyph too sparse, it will look small next to Signal/WhatsApp (11-25%)');
  if (coverage > INK_MAX) warnings.push('  ! ink over 32%: it will look heavy; open it up');
  const lines = [
    `shape ${shape}: glyph ${(w * 100).toFixed(0)}% x ${(h * 100).toFixed(0)}% of the tile, ink ${(coverage * 100).toFixed(1)}%`,
    ...warnings,
    `android: glyph half-diagonal ${halfDiag.toFixed(1)}dp ${halfDiag > ANDROID.safeRadius ? '> 33dp: corners leave the safe zone, can be clipped' : '<= 33dp safe zone'}`,
  ];
  if (halfDiag > ANDROID.safeRadius) warnings.push(`  ! android: glyph half-diagonal ${halfDiag.toFixed(1)}dp > 33dp: corners leave the safe zone, can be clipped`);
  return { shape, long: KL.long, w, h, coverage, halfDiag, lines, warnings };
}
