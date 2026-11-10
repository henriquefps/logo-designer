// Approximate previews of how the OS recolours the icon: Android 13+ themed icons (Material You)
// and iOS 18+ Light / Dark / Tinted. The OS renders these itself; these SVGs only approximate it
// from the same glyph and keylines as the exported files (src/icon).
import { glyphColourOf, glyphG, inkOf, iosDarkInk, IOS_DARK_BG, KEYLINE, silhouetteOf, tileOf, type IconSources, type Ink } from '@/icon';

export const DEFAULT_TINT = '#e8a33d';

type Hsl = [number, number, number];

function hexToHsl(hex: string): Hsl {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** `hsl()` colour string (SVG accepts it). */
const hsl = (h: number, s: number, l: number) => `hsl(${h.toFixed(1)} ${(Math.min(1, s) * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

/** Valid #rrggbb or the default tint. */
export const safeTint = (tint: string) => (/^#[0-9a-f]{6}$/i.test(tint) ? tint : DEFAULT_TINT);

/**
 * Material You tones from a seed colour (the wallpaper accent), approximated in HSL: Android's
 * themed icons draw the monochrome layer in a dark tone on a light tonal shape in light mode and a
 * light tone on a dark tonal shape in dark mode.
 */
export function androidThemedColors(seed: string, dark: boolean): { bg: string; fg: string } {
  const [h, s] = hexToHsl(safeTint(seed));
  const sat = Math.min(s, 0.6);
  return dark ? { bg: hsl(h, sat * 0.45, 0.2), fg: hsl(h, sat, 0.86) } : { bg: hsl(h, sat, 0.9), fg: hsl(h, sat * 0.9, 0.2) };
}

const svg = (body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

/** Android themed icon: the monochrome glyph (same keyline as the adaptive foreground) on a tonal circle. */
export function androidThemedSvg(src: IconSources, seed: string, dark: boolean): string {
  const { bg, fg } = androidThemedColors(seed, dark);
  return svg(`<circle cx="64" cy="64" r="64" fill="${bg}"/>${glyphG(src.glyph, 128, KEYLINE[src.shape].long, silhouetteOf(src, fg))}`);
}

/** `hsl()` parts (degrees, 0..1, 0..1) → rgb 0..1, to tint the grayscale of a full-colour glyph. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export type IosAppearance = 'light' | 'dark' | 'tinted';

/** iOS app icon corner radius ≈ 22.37% of the side (approximated with a plain rounded rect). */
const IOS_RX = 28.6;

/**
 * iOS 18 appearances: Light = the opaque blue tile; Dark = the dark-variant glyph on the system's
 * dark gradient; Tinted = the grayscale variant recoloured: the glyph in the tint on a dark,
 * tint-shaded gradient.
 */
export function iosAppearanceSvg(src: IconSources, appearance: IosAppearance, tint: string): string {
  const clip = `<clipPath id="ios"><rect width="128" height="128" rx="${IOS_RX}"/></clipPath>`;
  const fill = KEYLINE[src.shape].long;
  if (appearance === 'light') return svg(`<g clip-path="url(#ios)"><rect width="128" height="128" fill="${tileOf(src)}"/>${glyphG(src.glyph, 128, fill, inkOf(src, glyphColourOf(src)))}</g>`, clip);
  const [h, s] = hexToHsl(safeTint(tint));
  const [top, bottom] = appearance === 'dark' ? IOS_DARK_BG : [hsl(h, s * 0.35, 0.2), hsl(h, s * 0.35, 0.07)];
  const tintL = hsl(h, Math.max(s, 0.5), 0.68);
  // Tinted: the system maps the luminance of the (grayscale) icon onto the tint: a full-colour glyph is its grayscale times the tint.
  const glyph: Ink = appearance === 'dark' ? iosDarkInk(src) : src.full ? { gray: true, tint: hslToRgb(h, Math.max(s, 0.5), 0.68) } : tintL;
  const grad = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
  return svg(`<g clip-path="url(#ios)"><rect width="128" height="128" fill="url(#bg)"/>${glyphG(src.glyph, 128, fill, glyph)}</g>`, clip + grad);
}
