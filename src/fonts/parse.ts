import type opentype from 'opentype.js';
import { readGposKerning, type KernFn } from './kerning';
import type { FontMetrics, FontStyle, WeightRange } from './types';

/**
 * opentype.js wrapper: lazy import, parsing, kerning and variable-font aware advances/paths.
 * Per-character glyph mapping on purpose (no GSUB ligatures): opentype.js' shaping is incomplete,
 * and the canvas renders with `font-variant-ligatures: none` so live text and outlines agree.
 */

export type OtFont = opentype.Font;
type OtModule = typeof opentype;

let otPromise: Promise<OtModule> | null = null;
export function loadOpentype(): Promise<OtModule> {
  otPromise ??= import('opentype.js').then((mod) => (mod as unknown as { default?: OtModule }).default ?? (mod as unknown as OtModule));
  return otPromise;
}

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

export function detectFormat(buf: ArrayBuffer): FontFormat | null {
  if (buf.byteLength < 4) return null;
  const v = new DataView(buf);
  const tag = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  if (v.getUint32(0) === 0x00010000 || tag === 'true') return 'ttf';
  return null;
}

/** Decompresses WOFF2 to sfnt with a lazily loaded wasm decoder; other formats pass through. */
export async function toParsable(buf: ArrayBuffer): Promise<ArrayBuffer> {
  if (detectFormat(buf) !== 'woff2') return buf;
  const { default: decompress } = await import('woff2-encoder/decompress');
  const out = await decompress(new Uint8Array(buf));
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

interface VariationApi {
  getTransform: (glyph: opentype.Glyph, coords: Record<string, number>) => opentype.Glyph;
}
type FvarAxis = { tag: string; minValue: number; defaultValue: number; maxValue: number };

export interface LoadedFont {
  ot: OtFont;
  kern: KernFn | null;
  metrics: FontMetrics;
  axes: FvarAxis[];
  /** Advance (font units) of a glyph at the given variation. */
  advance: (glyph: opentype.Glyph, coords?: Record<string, number>) => number;
  glyphFor: (char: string) => opentype.Glyph;
  kerning: (left: opentype.Glyph, right: opentype.Glyph) => number;
  /** Glyph outline at the given variation, in font units (y up). */
  glyphPath: (glyph: opentype.Glyph, x: number, y: number, fontSize: number, coords?: Record<string, number>) => opentype.Path;
}

export function readMetrics(ot: OtFont): FontMetrics {
  const os2 = ot.tables.os2 as unknown as { fsSelection: number; sTypoAscender: number; sTypoDescender: number } | undefined;
  const hhea = ot.tables.hhea as unknown as { ascender: number; descender: number };
  const useTypo = os2 && os2.fsSelection & 128;
  return {
    unitsPerEm: ot.unitsPerEm,
    ascender: useTypo ? os2.sTypoAscender : hhea.ascender,
    descender: useTypo ? os2.sTypoDescender : hhea.descender,
  };
}

export function wrapFont(ot: OtFont, sfnt: ArrayBuffer): LoadedFont {
  const axes = ((ot.tables.fvar as { axes?: FvarAxis[] } | undefined)?.axes ?? []) as FvarAxis[];
  const variation = (ot as unknown as { variation?: VariationApi }).variation;
  const hasHvar = !!(ot.tables as Record<string, unknown>).hvar;
  const kern = readGposKerning(sfnt);
  const advCache = new Map<string, number>();
  const glyphCache = new Map<string, opentype.Glyph>();
  const coordsKey = (c?: Record<string, number>) => (c ? Object.entries(c).map(([k, v]) => `${k}=${v}`).join(',') : '');

  const advance = (glyph: opentype.Glyph, coords?: Record<string, number>) => {
    if (!axes.length || !hasHvar || !variation || !coords) return glyph.advanceWidth ?? 0;
    const k = `${glyph.index}|${coordsKey(coords)}`;
    let a = advCache.get(k);
    if (a === undefined) {
      a = variation.getTransform(glyph, coords).advanceWidth ?? 0;
      advCache.set(k, a);
    }
    return a;
  };

  return {
    ot,
    kern,
    metrics: readMetrics(ot),
    axes,
    advance,
    glyphFor: (char) => {
      let g = glyphCache.get(char);
      if (!g) {
        g = ot.charToGlyph(char);
        glyphCache.set(char, g);
      }
      return g;
    },
    kerning: (l, r) => (kern ? kern(l.index, r.index) : ot.getKerningValue(l, r)),
    glyphPath: (glyph, x, y, fontSize, coords) => {
      const opts = coords && axes.length ? ({ variation: coords } as unknown as opentype.RenderOptions) : undefined;
      return glyph.getPath(x, y, fontSize, opts, ot);
    },
  };
}

export async function parseFont(buf: ArrayBuffer): Promise<LoadedFont> {
  const sfnt = await toParsable(buf);
  const ot = (await loadOpentype()).parse(sfnt);
  return wrapFont(ot, sfnt);
}

/** Variation coordinates for a weight/opsz on this font (only the axes it has). */
export function coordsFor(font: LoadedFont, weight: number, opsz?: number): Record<string, number> | undefined {
  if (!font.axes.length) return undefined;
  const c: Record<string, number> = {};
  for (const a of font.axes) {
    if (a.tag === 'wght') c.wght = Math.min(a.maxValue, Math.max(a.minValue, weight));
    else if (a.tag === 'opsz' && opsz !== undefined) c.opsz = Math.min(a.maxValue, Math.max(a.minValue, opsz));
    else c[a.tag] = a.defaultValue;
  }
  return c;
}

export interface FontFileInfo {
  family: string;
  subfamily: string;
  weight: WeightRange;
  style: FontStyle;
  metrics: FontMetrics;
  opsz?: [number, number];
  format: FontFormat;
}

function nameOf(ot: OtFont, ...keys: string[]): string {
  // opentype.js 2 groups names by platform; 1.x had them flat.
  const names = ot.names as unknown as Record<string, Record<string, Record<string, string>> | Record<string, string>>;
  const groups = ['windows', 'macintosh', 'unicode'].map((p) => names[p] as Record<string, Record<string, string>> | undefined).filter(Boolean);
  for (const key of keys) {
    for (const g of [...groups, names as unknown as Record<string, Record<string, string>>]) {
      const entry = g?.[key];
      if (entry && typeof entry === 'object') {
        const v = entry.en ?? Object.values(entry)[0];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
  }
  return '';
}

const STYLE_WORDS = /\s+(thin|hairline|extra ?light|ultra ?light|light|regular|book|normal|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|black|heavy)$/i;
/** "Space Grotesk Light" → "Space Grotesk" (only trailing weight words). */
export function stripStyleWords(name: string): string {
  let out = name.trim();
  while (STYLE_WORDS.test(out)) out = out.replace(STYLE_WORDS, '');
  return out || name;
}

/** Reads what an uploaded font file declares (family, weight range, style, metrics). */
export async function inspectFont(buf: ArrayBuffer, fileName: string): Promise<{ info: FontFileInfo; sfnt: ArrayBuffer; font: LoadedFont }> {
  const format = detectFormat(buf);
  if (!format) throw new Error(`${fileName} is not a font file (TTF, OTF, WOFF or WOFF2).`);
  const sfnt = await toParsable(buf);
  const ot = (await loadOpentype()).parse(sfnt);
  const font = wrapFont(ot, sfnt);
  const os2 = ot.tables.os2 as { usWeightClass?: number; fsSelection?: number } | undefined;
  const head = ot.tables.head as { macStyle?: number } | undefined;
  const wAxis = font.axes.find((a) => a.tag === 'wght');
  const oAxis = font.axes.find((a) => a.tag === 'opsz');
  const subfamily = nameOf(ot, 'typoSubfamilyName', 'preferredSubfamily', 'fontSubfamily') || 'Regular';
  const italic = !!((os2?.fsSelection ?? 0) & 1) || !!((head?.macStyle ?? 0) & 2) || /italic|oblique/i.test(subfamily);
  const w = os2?.usWeightClass || 400;
  const typo = nameOf(ot, 'typoFamilyName', 'preferredFamily');
  let family = typo || nameOf(ot, 'fontFamily') || fileName.replace(/\.[^.]+$/, '');
  // Variable fonts without a typographic family often name ID 1 after the default instance ("X Light").
  if (!typo && wAxis) family = stripStyleWords(family);
  return {
    info: {
      family,
      subfamily,
      weight: wAxis ? [wAxis.minValue, wAxis.maxValue] : [w, w],
      style: italic ? 'italic' : 'normal',
      metrics: font.metrics,
      opsz: oAxis ? [oAxis.minValue, oAxis.maxValue] : undefined,
      format,
    },
    sfnt,
    font,
  };
}
