// Colour maths for app icons: WCAG contrast of the glyph against its tile, and the colours a
// full-colour glyph fragment actually uses. MIRRORS ~/.agents/skills/hfps-repo-assets/assets/
// build-icons.mjs (contrast warning): change both together. Pure.
import { BRAND, GLYPH_DEFAULT, IOS_DARK_BG } from './rules';

/** WCAG asks 3:1 for graphical objects such as icons. */
export const MIN_CONTRAST = 3;

const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' };

/** `#rgb` / `#rrggbb` (or white / black) → lowercase `#rrggbb`; null otherwise. */
export function hexOf(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (NAMED[t]) return NAMED[t];
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(t);
  if (!m) return null;
  return '#' + (m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]);
}

/** WCAG relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rrggbb` colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Distinct colours painted by a glyph fragment (fill, stroke, stop-color attributes), in order of appearance. */
export function glyphColours(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\s(?:fill|stroke|stop-color)="([^"]*)"/g)) {
    const h = hexOf(m[1]);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

export interface ContrastInput {
  /** Glyph fragment (full-colour: its own paints; one-colour: currentColor). */
  glyph: string;
  full: boolean;
  /** One-colour glyph colour; absent = white. */
  glyphColour?: string;
  tile?: string;
}

/** Warning lines (leading two spaces and "!", like the script's) for glyph colours that nearly vanish on the tile. */
export function contrastWarnings({ glyph, full, glyphColour, tile = BRAND }: ContrastInput): string[] {
  const colours = full ? glyphColours(glyph) : [glyphColour ?? GLYPH_DEFAULT];
  const low = colours.map((c) => ({ c, r: contrastRatio(c, tile) })).filter((x) => x.r < MIN_CONTRAST);
  if (!low.length) return [];
  const list = low
    .slice(0, 4)
    .map((x) => `${x.c} ${x.r.toFixed(1)}:1`)
    .join(', ');
  return [`  ! contrast: ${full ? 'glyph colours' : 'the glyph colour'} too close to the tile ${tile} (${list}; WCAG wants ${MIN_CONTRAST}:1 for icons): they will be hard to see`];
}

/** The iOS Dark glyph for a one-colour glyph colour that is not the default: kept when it reads on the dark background, else lightened. */
export function darkReadable(glyph: string, lighten: (c: string) => string): string {
  return contrastRatio(glyph, IOS_DARK_BG[0]) >= MIN_CONTRAST ? glyph : lighten(glyph);
}
