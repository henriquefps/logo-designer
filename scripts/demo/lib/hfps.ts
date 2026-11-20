// Henrique's hfps identity for what the demo videos draw on top of the app (caption bar, cursor ripple, speed badge,
// key badge, terminal strip, scene and end cards): the five palettes as four numbers each, the light tokens derived
// from them exactly as ~/.agents/skills/hfps-kit/visuals/hfps-tokens.css does, Inter (the app's own Inter Variable)
// and Phosphor icons (paths from @phosphor-icons/react, regular weight unless named). Blue is the default.
//
// The overlay runs inside the page from a serialized function, so it cannot import this module: `overlayOptions()`
// hands it the token CSS and the icon paths as plain strings.

export type Palette = 'blue' | 'olive' | 'violet' | 'rose' | 'graphite';

/** Neutrals' hue and chroma multiplier, brand hue and chroma (hfps-kit/brand/palettes.css). */
export const PALETTES: Record<Palette, { nh: number; nc: number; bh: number; bc: number }> = {
  blue: { nh: 250, nc: 1.5, bh: 255, bc: 0.14 },
  olive: { nh: 107, nc: 1, bh: 135, bc: 0.09 },
  violet: { nh: 295, nc: 1.5, bh: 295, bc: 0.16 },
  rose: { nh: 5, nc: 1.2, bh: 355, bc: 0.16 },
  graphite: { nh: 260, nc: 0.3, bh: 260, bc: 0.02 },
};

const n = (x: number) => Number(x.toFixed(4));

/**
 * The visuals' light tokens for a palette, as `--demo-*` custom properties (prefixed: the app has its own `--card`,
 * `--border`…). Same formulas as hfps-tokens.css; `--demo-hair` is the app's 0.9 hairline border.
 */
export function hfpsTokens(palette: Palette = 'blue'): Record<string, string> {
  const { nh, nc, bh, bc } = PALETTES[palette];
  const neutral = (l: number, c: number) => `oklch(${l} ${n(c * nc)} ${nh})`;
  return {
    '--demo-bg': neutral(0.966, 0.005),
    '--demo-card': 'oklch(1 0 0)',
    '--demo-fg': neutral(0.153, 0.006),
    '--demo-muted': neutral(0.925, 0.008),
    '--demo-muted-fg': neutral(0.5, 0.031),
    '--demo-border': neutral(0.85, 0.012),
    '--demo-hair': neutral(0.9, 0.01),
    '--demo-line': neutral(0.42, 0.02),
    '--demo-accent': `oklch(0.5 ${bc} ${bh})`,
    '--demo-accent-fg': neutral(0.988, 0.003),
    '--demo-accent-soft': `oklch(0.93 ${n(Math.min(bc * 0.5, 0.045))} ${bh})`,
    '--demo-accent-soft-border': `oklch(0.72 ${n(bc * 0.9)} ${bh})`,
  };
}

export const tokensCss = (palette: Palette = 'blue') =>
  `:root { ${Object.entries(hfpsTokens(palette))
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ')} }`;

/** Inter as the app loads it (@fontsource-variable/inter registers "Inter Variable"); never a system fallback first. */
export const FONT = "'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif";
export const MONO = "ui-monospace, 'JetBrains Mono', 'DejaVu Sans Mono', monospace";

/** Phosphor icon paths (viewBox 0 0 256 256). */
export const ICONS = {
  fastForward: 'M256,128a15.76,15.76,0,0,1-7.33,13.34L160.48,197.5A15.91,15.91,0,0,1,136,184.16v-37.3L56.48,197.5A15.91,15.91,0,0,1,32,184.16V71.84A15.91,15.91,0,0,1,56.48,58.5L136,109.14V71.84A15.91,15.91,0,0,1,160.48,58.5l88.19,56.16A15.76,15.76,0,0,1,256,128Z',
  check: 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
  keyboard:
    'M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm0,144H32V64H224V192Zm-16-64a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16H200A8,8,0,0,1,208,128Zm0-32a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16H200A8,8,0,0,1,208,96ZM72,160a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16h8A8,8,0,0,1,72,160Zm96,0a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,160Zm40,0a8,8,0,0,1-8,8h-8a8,8,0,0,1,0-16h8A8,8,0,0,1,208,160Z',
  arrowRight: 'M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z',
} as const;

/** Designer's app icon (public/icon.svg): the glyph on the blue tile, for the end card. */
export const APP_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#2063b0"/><g transform="translate(17.318 15.059) scale(0.75294)"><path d="M44 14L58.16 38.78L58.16 48.118C44.381 48.237 33.344 57.918 27.174 69.649C27.113 69.766 27.053 69.883 26.994 70L12 70Z" fill-rule="evenodd" fill="#fff" opacity="0.45"/><path d="M68 24L106 24C109.314 24 112 26.686 112 30L112 68C112 71.314 109.314 74 106 74L94.653 74C91.681 64.034 83.662 56.071 74.351 51.174C70.416 49.105 66.269 48.606 62 48.293L62 30C62 26.686 64.686 24 68 24Z" fill-rule="evenodd" fill="#fff" opacity="0.7"/><circle cx="60" cy="84" r="32" fill="#fff"/></g></svg>';

export interface OverlayOptions {
  captionHeight: number;
  /** `:root { --demo-…: … }` from `tokensCss()`. */
  tokens: string;
  font: string;
  mono: string;
  icons: Record<keyof typeof ICONS, string>;
  appIcon: string;
}

export const overlayOptions = (captionHeight: number, palette: Palette = 'blue'): OverlayOptions => ({
  captionHeight,
  tokens: tokensCss(palette),
  font: FONT,
  mono: MONO,
  icons: { ...ICONS },
  appIcon: APP_ICON,
});
