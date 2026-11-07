import { joinColor, normalizeHex } from '@/model';

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080',
  teal: '#008080', maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff',
  fuchsia: '#ff00ff', magenta: '#ff00ff', pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700', indigo: '#4b0082',
  violet: '#ee82ee', crimson: '#dc143c', coral: '#ff7f50', salmon: '#fa8072', tomato: '#ff6347', khaki: '#f0e68c',
  beige: '#f5f5dc', tan: '#d2b48c', chocolate: '#d2691e', orchid: '#da70d6', plum: '#dda0dd', turquoise: '#40e0d0',
  skyblue: '#87ceeb', steelblue: '#4682b4', royalblue: '#4169e1', darkblue: '#00008b', darkgreen: '#006400',
  darkred: '#8b0000', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3', lightgrey: '#d3d3d3',
  dimgray: '#696969', dimgrey: '#696969', whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc', ivory: '#fffff0',
  lavender: '#e6e6fa', forestgreen: '#228b22', seagreen: '#2e8b57', limegreen: '#32cd32', slategray: '#708090',
  slategrey: '#708090', firebrick: '#b22222', hotpink: '#ff69b4', deeppink: '#ff1493', dodgerblue: '#1e90ff',
  deepskyblue: '#00bfff', midnightblue: '#191970', darkorange: '#ff8c00', goldenrod: '#daa520', sienna: '#a0522d',
};

let ctx: CanvasRenderingContext2D | null | undefined;
/** Uses the browser's CSS parser (hsl(), lab(), every named color) when a DOM is available. */
function browserColor(value: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    ctx ??= document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  ctx.fillStyle = '#010203';
  ctx.fillStyle = value;
  const out = String(ctx.fillStyle);
  if (out === '#010203' && value.replace(/\s/g, '') !== '#010203') return null;
  return out;
}

/** Parses a CSS color into #rrggbb plus alpha, or null when it is not a color (none, url(), unknown). */
export function parseColor(input: string): { color: string; alpha: number } | null {
  const v = input.trim().toLowerCase();
  if (!v || v === 'none' || v.startsWith('url(')) return null;
  if (v === 'transparent') return { color: '#000000', alpha: 0 };
  if (v.startsWith('#')) {
    const hex = normalizeHex(v);
    if (!hex) return null;
    return hex.length === 9 ? { color: hex.slice(0, 7), alpha: parseInt(hex.slice(7), 16) / 255 } : { color: hex, alpha: 1 };
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(v);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (s: string) => Math.max(0, Math.min(255, Math.round(s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s))));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const hex = '#' + parts.slice(0, 3).map((p) => ch(p).toString(16).padStart(2, '0')).join('');
    return { color: hex, alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1 };
  }
  if (NAMED[v]) return { color: NAMED[v], alpha: 1 };
  const b = browserColor(v);
  return b && b !== v ? parseColor(b) : null;
}

/** #rrggbb(aa) for a CSS color with an extra opacity multiplier, or null. */
export function toModelColor(input: string, opacity = 1): string | null {
  const c = parseColor(input);
  return c ? joinColor(c.color, c.alpha * opacity) : null;
}
