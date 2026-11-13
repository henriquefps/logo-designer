// Every output of build-icons.mjs: tile SVGs, Android layers and XML, iOS Contents.json, the .ico
// container and the review sheet. MIRRORS ~/.agents/skills/hfps-kit/repo-assets/assets/build-icons.mjs:
// change both together. Pure string / byte builders, no DOM.
import { darkReadable, hexOf } from './colour';
import { faviconFill, fit, type Fit, type InkBox } from './measure';
import { pathBox, type Box } from './pathBox';
import {
  ANDROID,
  BRAND,
  FAVICON_RX,
  ICON_COMPOSER_CANVAS,
  IOS_DARK_BG,
  iosDarkGlyphFor,
  IOS_TINTED_BG,
  IOS_TINTED_GLYPH,
  KEYLINE,
  LEGACY_RX,
  LIGHT_BORDER,
  REFERENCE_CIRCLE,
  REFERENCE_PINK,
  TILE_RX,
  type IconShape,
} from './rules';

/** A measured glyph ready to place: its source (128 space, currentColor) and ink box. */
export interface PlacedGlyph {
  src: string;
  box: InkBox;
}

export interface IconSources {
  glyph: PlacedGlyph;
  /** Simplified favicon glyph (`--small`); absent = the main glyph. */
  small?: PlacedGlyph;
  shape: IconShape;
  /** Tile colour (`#rrggbb`); absent = BRAND. */
  tile?: string;
  /** Full-colour glyph: the fragment keeps its own paints (solids, gradients, opacity). Absent = one colour (currentColor). */
  full?: boolean;
  /** One-colour glyph colour (`#rrggbb`); absent = white. Unused in full-colour mode. */
  glyphColour?: string;
}

/** The tile colour of a set of sources. */
export const tileOf = (src: Pick<IconSources, 'tile'>) => src.tile ?? BRAND;

/** The one-colour glyph colour as written in the SVGs: `#fff` for the default (byte-identical to older sets). */
export const glyphColourOf = (src: Pick<IconSources, 'glyphColour'>) => src.glyphColour ?? '#fff';

/**
 * How a glyph is inked where it is placed: a colour recolours currentColor (one-colour); `keep` leaves the
 * glyph's own paints (full-colour; `keep` is the colour for a stray currentColor); `silhouette` paints the
 * alpha in one colour (Android monochrome); `gray` is the luminance grayscale (iOS Tinted), optionally
 * multiplied by a tint (previews).
 */
export type Ink = string | { keep: string } | { silhouette: string } | { gray: true; tint?: readonly [number, number, number] };

/** `color` in one-colour mode, the glyph's own paints in full-colour mode. */
export const inkOf = (src: IconSources, color: string): Ink => (src.full ? { keep: glyphColourOf(src) } : color);
/** The glyph's alpha in `color` (a plain recolour in one-colour mode). */
export const silhouetteOf = (src: IconSources, color: string): Ink => (src.full ? { silhouette: color } : color);
/** Grayscale of the glyph (one-colour mode: `color`). */
export const grayOf = (src: IconSources, color: string): Ink => (src.full ? { gray: true } : color);

const num = (v: number) => String(Math.round(v * 1e5) / 1e5);
const rgb01 = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);

/** The glyph fitted into a tile of size T at (ox, oy), inked as `ink` says (a string recolours currentColor). */
export function glyphG(g: PlacedGlyph, T: number, fill: number, ink: Ink, ox = 0, oy = 0): string {
  const at = fit(g.box, T, fill, ox, oy).attr;
  if (typeof ink === 'string') return `<g transform="${at}">${g.src.replaceAll('currentColor', ink)}</g>`;
  if ('keep' in ink) return `<g transform="${at}">${g.src.replaceAll('currentColor', ink.keep)}</g>`;
  const id = 'silhouette' in ink ? 'ink-silhouette' : 'ink-gray';
  let m: string;
  if ('silhouette' in ink) {
    const [r, gr, b] = rgb01(hexOf(ink.silhouette) ?? '#000000').map(num);
    m = `0 0 0 0 ${r} 0 0 0 0 ${gr} 0 0 0 0 ${b} 0 0 0 1 0`;
  } else {
    const [tr, tg, tb] = ink.tint ?? [1, 1, 1];
    const row = (k: number) => `${num(0.2126 * k)} ${num(0.7152 * k)} ${num(0.0722 * k)} 0 0`;
    m = `${row(tr)} ${row(tg)} ${row(tb)} 0 0 0 1 0`;
  }
  // The region is explicit: a bounding-box region would vanish for a glyph that is a single straight line.
  return (
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="${num(ox - T)}" y="${num(oy - T)}" width="${num(3 * T)}" height="${num(3 * T)}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${m}"/></filter>` +
    `<g filter="url(#${id})"><g transform="${at}">${g.src.replaceAll('currentColor', '#000')}</g></g>`
  );
}

/** The glyph colour of the light variant: the glyph's own paints, a custom glyph colour, or else the tile colour. */
export const lightInk = (src: IconSources): Ink => (src.full ? { keep: tileOf(src) } : (src.glyphColour ?? tileOf(src)));

export interface TileOptions {
  glyph?: PlacedGlyph;
  fill?: number;
  rx?: number;
  bg?: string;
  color?: Ink;
  border?: boolean;
  size?: number;
}

/** 128 tile: rx 28 blue with a white glyph by default; `border` = the light variant. */
export function tileSvg(src: IconSources, o: TileOptions = {}): string {
  const { glyph = src.glyph, fill = KEYLINE[src.shape].long, rx = TILE_RX, bg = tileOf(src), color = inkOf(src, glyphColourOf(src)), border = false, size = 512 } = o;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">` +
    (border
      ? `<rect x="1" y="1" width="126" height="126" rx="${Math.max(rx - 1, 0)}" fill="#fff" stroke="${LIGHT_BORDER}" stroke-width="2"/>`
      : `<rect width="128" height="128" rx="${rx}" fill="${bg}"/>`) +
    glyphG(glyph, 128, fill, color) +
    `</svg>`
  );
}

export const darkTile = (src: IconSources) => tileSvg(src);
export const lightTile = (src: IconSources) => tileSvg(src, { border: true, color: lightInk(src) });

/** Favicon tile: rx 24, the small glyph at SMALL_FILL (or the main one at min(0.76, long + 0.08)). */
export const faviconSvg = (src: IconSources) =>
  tileSvg(src, { glyph: src.small ?? src.glyph, fill: faviconFill(src.shape, !!src.small), rx: FAVICON_RX });

/** Android adaptive layer: 108 canvas, visible tile T = 72 centred (18 inset). */
export const layerSvg = (src: IconSources, color: Ink, withBg = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="432" height="432">` +
  (withBg ? `<rect width="108" height="108" fill="${tileOf(src)}"/>` : '') +
  glyphG(src.glyph, ANDROID.tile, KEYLINE[src.shape].long, color, ANDROID.inset, ANDROID.inset) +
  `</svg>`;

export const legacyLauncherSvg = (src: IconSources) => tileSvg(src, { rx: LEGACY_RX });
export const legacyRoundSvg = (src: IconSources) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512"><circle cx="64" cy="64" r="64" fill="${tileOf(src)}"/>${glyphG(src.glyph, 128, KEYLINE[src.shape].long, inkOf(src, glyphColourOf(src)))}</svg>`;

/** Full-bleed opaque square (apple-touch, maskable, iOS). */
export const squareSvg = (src: IconSources) => tileSvg(src, { rx: 0 });

export const ANDROID_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;

export const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;

export const backgroundXml = (tile: string = BRAND) => `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${tile}</color>\n</resources>\n`;
export const BACKGROUND_XML = backgroundXml();

/** The launcher background colour line the script writes (and sets inside an existing file). */
export const backgroundColorLine = (tile: string = BRAND) => `<color name="ic_launcher_background">${tile}</color>`;
export const BACKGROUND_COLOR_LINE = backgroundColorLine();

/**
 * values/ic_launcher_background.xml, mirroring build-icons.mjs: with an existing file that has the entry, only
 * that colour is replaced; else, if it has `</resources>`, the entry is inserted before it (other colours such as
 * splash_background are kept); otherwise a fresh file.
 */
export function mergeLauncherBackground(prev: string | null | undefined, tile: string = BRAND): string {
  const line = backgroundColorLine(tile);
  const re = /<color name="ic_launcher_background">[^<]*<\/color>/;
  if (prev && re.test(prev)) return prev.replace(re, line);
  if (prev && prev.includes('</resources>')) return prev.replace('</resources>', `    ${line}\n</resources>`);
  return backgroundXml(tile);
}

/** `#rrggbb` + alpha → Android `#AARRGGBB` (opaque: `#RRGGBB`), uppercase. */
const androidColour = (hex: string, alpha = 1) => '#' + (alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, '0') : '') + hex.slice(1).toUpperCase();

interface Grad {
  type: 'linear' | 'radial';
  a: Record<string, string>;
  stops: { offset: number; color: string; opacity: number }[];
}

/**
 * Glyph SVG -> Android VectorDrawable (drawable/ic_splash.xml). Handles <path>, <rect>, <circle>, <line>
 * and <g> with inherited fill / stroke / stroke-width / opacity / caps / joins / fill-rule. Transforms are
 * not supported: returns { error } instead of a wrong drawing. One colour (default): every paint is white.
 * `full`: solid fills and strokes keep their colours (with fill-opacity / stroke-opacity) and linear /
 * radial gradients become aapt:attr gradients placed on the shape's bounding box; a paint that cannot be
 * translated (gradientTransform, an unknown colour) falls back to white with an entry in `warnings`.
 * MIRRORS splashVector() in build-icons.mjs.
 */
export function splashVector(src: string, f: Fit, full = false): { xml: string; warnings?: string[]; error?: undefined } | { error: string; xml?: undefined; warnings?: undefined } {
  const out: string[] = [];
  const warnings: string[] = [];
  let usesGradient = false;
  type St = Record<string, string> & { opacity: number };
  const stack: St[] = [{ fill: '#000', stroke: 'none', 'stroke-width': '1', opacity: 1, 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'fill-rule': 'nonzero', 'fill-opacity': '1', 'stroke-opacity': '1' } as unknown as St];
  const attrsOf = (t: string) => Object.fromEntries([...t.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const n = (v: string | undefined) => Number(v ?? 0);
  const grads = new Map<string, Grad>();
  let openGrad: Grad | null = null;
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w);
  };
  /** One paint → [attribute value on the path, child element or null]. */
  const paintOf = (name: 'fillColor' | 'strokeColor', value: string, box: Box | null): { attr?: string; child?: string } => {
    const white = { attr: `            android:${name}="#FFFFFF"` };
    if (!full) return white;
    const url = /^url\(#([^)]+)\)$/.exec(value.trim());
    if (url) {
      const g = grads.get(url[1]);
      if (!g || !g.stops.length) {
        warn(`gradient #${url[1]} not found: painted white`);
        return white;
      }
      if (g.a.gradientTransform) {
        warn('gradientTransform is not supported: gradient painted white');
        return white;
      }
      const user = g.a.gradientUnits === 'userSpaceOnUse';
      if (!user && !box) {
        warn('gradient on a shape without a measurable box: painted white');
        return white;
      }
      const b = user ? { x: 0, y: 0, w: 1, h: 1 } : box!;
      const pt = (x: number, y: number): [number, number] => [b.x + x * b.w, b.y + y * b.h];
      const N = (v: number) => String(Math.round(v * 1000) / 1000);
      const pct = (v: string | undefined, d: number) => (v == null ? d : v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v));
      const items = g.stops.map((s) => `                    <item android:color="${androidColour(s.color, s.opacity)}" android:offset="${N(s.offset)}" />`).join('\n');
      let head: string;
      if (g.type === 'linear') {
        const [sx, sy] = user ? [pct(g.a.x1, 0), pct(g.a.y1, 0)] : pt(pct(g.a.x1, 0), pct(g.a.y1, 0));
        const [ex, ey] = user ? [pct(g.a.x2, 1), pct(g.a.y2, 0)] : pt(pct(g.a.x2, 1), pct(g.a.y2, 0));
        head = `android:type="linear"\n                    android:startX="${N(sx)}"\n                    android:startY="${N(sy)}"\n                    android:endX="${N(ex)}"\n                    android:endY="${N(ey)}"`;
      } else {
        const [cx, cy] = user ? [pct(g.a.cx, 0.5), pct(g.a.cy, 0.5)] : pt(pct(g.a.cx, 0.5), pct(g.a.cy, 0.5));
        const r = pct(g.a.r, 0.5) * (user ? 1 : Math.max(b.w, b.h));
        head = `android:type="radial"\n                    android:centerX="${N(cx)}"\n                    android:centerY="${N(cy)}"\n                    android:gradientRadius="${N(r)}"`;
      }
      usesGradient = true;
      return { child: `        <aapt:attr name="android:${name}">\n            <gradient\n                    ${head}>\n${items}\n            </gradient>\n        </aapt:attr>` };
    }
    const h = value.trim() === 'currentColor' ? '#ffffff' : hexOf(value);
    if (!h) {
      warn(`colour “${value}” is not a hex colour: painted white`);
      return white;
    }
    return { attr: `            android:${name}="${androidColour(h)}"` };
  };
  for (const m of src.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (full && /^(linear|radial)Gradient$/.test(tag)) {
      if (close) openGrad = null;
      else {
        const a = attrsOf(rest);
        openGrad = { type: tag.startsWith('linear') ? 'linear' : 'radial', a, stops: [] };
        if (a.id) grads.set(a.id, openGrad);
        if (self) openGrad = null;
      }
      continue;
    }
    if (full && tag === 'stop' && !close) {
      const a = attrsOf(rest);
      const sc = a['stop-color'] ?? (/stop-color:\s*([^;"]+)/.exec(a.style ?? '')?.[1] ?? '#000');
      const col = hexOf(sc);
      if (!col) warn(`stop colour “${sc}” is not a hex colour: used black`);
      const off = a.offset?.endsWith('%') ? Number(a.offset.slice(0, -1)) / 100 : n(a.offset);
      openGrad?.stops.push({ offset: off, color: col ?? '#000000', opacity: a['stop-opacity'] != null ? n(a['stop-opacity']) : 1 });
      continue;
    }
    if (full && tag === 'defs') continue;
    if (close) {
      if (tag === 'g') stack.pop();
      continue;
    }
    const a = attrsOf(rest);
    if (a.transform) return { error: `transform on <${tag}>` };
    const cur = { ...stack[stack.length - 1] } as St;
    for (const k of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', ...(full ? ['fill-opacity', 'stroke-opacity'] : [])]) if (a[k] != null) cur[k] = a[k];
    cur.opacity = stack[stack.length - 1].opacity * (a.opacity != null ? n(a.opacity) : 1);
    if (tag === 'g') {
      if (!self) stack.push(cur);
      continue;
    }
    if (tag === 'svg' || tag === 'title' || tag === 'desc') continue;
    let d: string;
    if (tag === 'path') d = a.d;
    else if (tag === 'line') d = `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    else if (tag === 'circle') {
      const cx = n(a.cx),
        cy = n(a.cy),
        r = n(a.r);
      d = `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
    } else if (tag === 'rect') {
      const x = n(a.x),
        y = n(a.y),
        w = n(a.width),
        h = n(a.height),
        r = Math.min(n(a.rx ?? a.ry), w / 2, h / 2);
      d = r
        ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
        : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    } else return { error: `unsupported <${tag}>` };
    const p = [`            android:pathData="${d}"`];
    const kids: string[] = [];
    const op = (extra: string) => {
      const v = cur.opacity * (full ? n(cur[extra]) : 1);
      return v < 1 ? v.toFixed(3) : null;
    };
    const box = full ? pathBox(d) : null;
    if (cur.fill !== 'none') {
      const pa = paintOf('fillColor', cur.fill, box);
      if (pa.attr) p.push(pa.attr);
      if (pa.child) kids.push(pa.child);
      if (cur['fill-rule'] === 'evenodd') p.push(`            android:fillType="evenOdd"`);
      const o = op('fill-opacity');
      if (o) p.push(`            android:fillAlpha="${o}"`);
    }
    if (cur.stroke !== 'none') {
      const pa = paintOf('strokeColor', cur.stroke, box);
      if (pa.attr) p.push(pa.attr);
      if (pa.child) kids.push(pa.child);
      p.push(`            android:strokeWidth="${cur['stroke-width']}"`, `            android:strokeLineCap="${cur['stroke-linecap']}"`, `            android:strokeLineJoin="${cur['stroke-linejoin']}"`);
      const o = op('stroke-opacity');
      if (o) p.push(`            android:strokeAlpha="${o}"`);
    }
    out.push(kids.length ? `        <path\n${p.join('\n')}>\n${kids.join('\n')}\n        </path>` : `        <path\n${p.join('\n')} />`);
  }
  if (!out.length) return { error: 'no shapes' };
  const [tx, ty] = f.attr.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1);
  return {
    xml: `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by build-icons.mjs (hfps-repo-assets) from the app glyph: do not edit by hand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"${usesGradient ? '\n    xmlns:aapt="http://schemas.android.com/aapt"' : ''}
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:translateX="${tx}"
        android:translateY="${ty}"
        android:scaleX="${f.s.toFixed(5)}"
        android:scaleY="${f.s.toFixed(5)}">
${out.join('\n')}
    </group>
</vector>
`,
    ...(warnings.length ? { warnings } : {}),
  };
}

/** The splash drawable for a measured glyph: same 108 canvas and fit as the adaptive foreground. */
export const splashDrawable = (src: IconSources) => splashVector(src.glyph.src, fit(src.glyph.box, ANDROID.tile, KEYLINE[src.shape].long, ANDROID.inset, ANDROID.inset), !!src.full);

// ---------- iOS: AppIcon.appiconset with the iOS 18 appearances ----------

/** File names inside AppIcon.appiconset: Light (any), Dark, Tinted, all 1024 × 1024. */
export const IOS_APPICON = {
  light: 'AppIcon-1024.png',
  dark: 'AppIcon-1024-dark.png',
  tinted: 'AppIcon-1024-tinted.png',
} as const;

/**
 * Contents.json: one universal 1024 image per appearance. Dark and Tinted carry
 * `appearances: [{ appearance: 'luminosity', value: 'dark' | 'tinted' }]` (what Xcode writes when
 * Appearance = "Any, Dark, Tinted" is set on a Single Size iOS icon).
 */
export const IOS_CONTENTS_JSON =
  JSON.stringify(
    {
      images: [
        { filename: IOS_APPICON.light, idiom: 'universal', platform: 'ios', size: '1024x1024' },
        { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: IOS_APPICON.dark, idiom: 'universal', platform: 'ios', size: '1024x1024' },
        { appearances: [{ appearance: 'luminosity', value: 'tinted' }], filename: IOS_APPICON.tinted, idiom: 'universal', platform: 'ios', size: '1024x1024' },
      ],
      info: { author: 'hfps build-icons', version: 1 },
    },
    null,
    2,
  ) + '\n';

/**
 * The iOS Dark glyph colour of a one-colour set: derived from the tile (iosDarkGlyphFor) by default; with a
 * custom glyph colour, that colour when it reads on the dark background (3:1), else its lightened version.
 */
export const iosDarkColour = (src: IconSources) => (src.glyphColour ? darkReadable(src.glyphColour, iosDarkGlyphFor) : iosDarkGlyphFor(tileOf(src)));
/** Dark ink: full-colour sets keep their paints, one-colour sets use iosDarkColour. */
export const iosDarkInk = (src: IconSources): Ink => (src.full ? { keep: iosDarkColour(src) } : iosDarkColour(src));

/** iOS 18 Dark: the glyph in IOS_DARK_GLYPH (full colour: its own colours) on a TRANSPARENT square (the system supplies the dark background). */
export const iosDarkSvg = (src: IconSources) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024">` +
  glyphG(src.glyph, 128, KEYLINE[src.shape].long, iosDarkInk(src)) +
  `</svg>`;

/** iOS 18 Tinted: grayscale, fully opaque: white glyph on black (flatten on IOS_TINTED_BG, no alpha). */
export const iosTintedSvg = (src: IconSources) => tileSvg(src, { rx: 0, bg: IOS_TINTED_BG, color: grayOf(src, IOS_TINTED_GLYPH), size: 1024 });

// ---------- iOS 26: Icon Composer file (AppIcon.icon) ----------

/** Icon Composer colour string: `srgb:r,g,b,a` with 5 decimals, as Icon Composer saves it. */
export function icSrgb(hexColor: string, alpha = 1): string {
  const [r, g, b] = hex(hexColor).map((v) => (v / 255).toFixed(5));
  return `srgb:${r},${g},${b},${alpha.toFixed(5)}`;
}

/** The glyph layer for Icon Composer: full 1024 canvas, transparent, white glyph on the keyline, no mask. */
export const iconComposerGlyphSvg = (src: IconSources) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_COMPOSER_CANVAS} ${ICON_COMPOSER_CANVAS}" width="${ICON_COMPOSER_CANVAS}" height="${ICON_COMPOSER_CANVAS}">` +
  glyphG(src.glyph, ICON_COMPOSER_CANVAS, KEYLINE[src.shape].long, inkOf(src, src.glyphColour ?? '#ffffff')) +
  `</svg>`;

export const ICON_COMPOSER_GLYPH = 'glyph.svg';

/**
 * icon.json of AppIcon.icon: background fill = brand blue (dark: IOS_DARK_BG gradient), one group with
 * the glyph layer (Liquid Glass on, Icon Composer's default shadow/translucency), the glyph recoloured
 * to IOS_DARK_GLYPH in Dark and to white (extended-gray 1) in Tinted. Keys mirror files saved by
 * Icon Composer (see docs/app-icons-theming.md).
 */
export function iconComposerJson(tile: string = BRAND, o: { full?: boolean; dark?: string } = {}): string {
  const json = {
    'fill-specializations': [
      { value: { solid: icSrgb(tile) } },
      { appearance: 'dark', value: { 'linear-gradient': IOS_DARK_BG.map((c) => icSrgb(c)) } },
    ],
    groups: [
      {
        layers: [
          {
            // Full colour: the layer keeps its own colours (no recolour in Dark; Tinted is derived by the system).
            ...(o.full
              ? {}
              : {
                  'fill-specializations': [
                    { appearance: 'dark', value: { solid: icSrgb(o.dark ?? iosDarkGlyphFor(tile)) } },
                    { appearance: 'tinted', value: { solid: 'extended-gray:1.00000,1.00000' } },
                  ],
                }),
            glass: true,
            'image-name': ICON_COMPOSER_GLYPH,
            name: 'glyph',
            position: { scale: 1, 'translation-in-points': [0, 0] },
          },
        ],
        name: 'Glyph',
        shadow: { kind: 'neutral', opacity: 0.5 },
        translucency: { enabled: true, value: 0.5 },
      },
    ],
    'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
  };
  // Icon Composer writes `"key" : value` with 2-space indent; JSON.stringify spacing is equivalent JSON.
  return JSON.stringify(json, null, 2) + '\n';
}

/** .ico container with PNG entries (16/32/48), as the script writes it. */
export function encodeIco(pngs: Uint8Array[], sizes: number[]): Uint8Array {
  const headerLen = 6 + 16 * sizes.length;
  const total = headerLen + pngs.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, sizes.length, true);
  let offset = headerLen;
  pngs.forEach((p, i) => {
    const e = 6 + 16 * i;
    out[e] = sizes[i] & 0xff;
    out[e + 1] = sizes[i] & 0xff;
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, p.length, true);
    v.setUint32(e + 12, offset, true);
    out.set(p, offset);
    offset += p.length;
  });
  return out;
}

// ---------- review sheet ----------

/** Superellipse path (n = 4, Samsung / One UI-like squircle) in the 128 space. */
export function squirclePath(n = 4, R = 64): string {
  let d = '';
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2,
      c = Math.cos(t),
      s = Math.sin(t);
    const x = 64 + R * Math.sign(c) * Math.abs(c) ** (2 / n),
      y = 64 + R * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + 'Z';
}

export const REFERENCE_CIRCLE_SVG = `<circle cx="64" cy="64" r="${(REFERENCE_CIRCLE * 64).toFixed(2)}" fill="none" stroke="${REFERENCE_PINK}" stroke-width="1" stroke-dasharray="3 3"/>`;

export const MASKS = {
  squircle: `<path d="${squirclePath()}"/>`,
  circle: '<circle cx="64" cy="64" r="64"/>',
  rounded: '<rect width="128" height="128" rx="28"/>',
} as const;
export type MaskId = keyof typeof MASKS;

/** The icon under a launcher mask (blue tile, white glyph), optionally with the 0.63 T circle. */
export function maskedSvg(src: IconSources, mask: MaskId, withRef: boolean, o: { light?: boolean } = {}): string {
  const glyph = glyphG(src.glyph, 128, KEYLINE[src.shape].long, o.light ? lightInk(src) : inkOf(src, glyphColourOf(src)));
  const bg = o.light ? `<rect width="128" height="128" fill="#fff"/>` : `<rect width="128" height="128" fill="${tileOf(src)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512"><defs><clipPath id="m">${MASKS[mask]}</clipPath></defs><g clip-path="url(#m)">${bg}${glyph}</g>${withRef ? REFERENCE_CIRCLE_SVG : ''}</svg>`;
}

export const SHEET = { width: 480, height: 360, background: '#1f1f1f' } as const;

export interface SheetTile {
  svg: string;
  size: number;
  left: number;
  top: number;
}

/** Tiles of the review sheet at the script's positions (row 1 masks, row 2 launcher, row 3 favicons). */
export function sheetTiles(src: IconSources): SheetTile[] {
  const tiles: SheetTile[] = [];
  const masks: MaskId[] = ['squircle', 'circle', 'rounded'];
  let x = 16;
  for (const [i, m] of masks.entries()) {
    // guide only on the first: the others show the real icon
    tiles.push({ svg: maskedSvg(src, m, i === 0), size: 128, left: x, top: 16 });
    x += 148;
  }
  x = 16;
  for (const s of [48, 56, 64, 96]) {
    tiles.push({ svg: maskedSvg(src, 'squircle', false), size: s, left: x, top: 170 });
    x += s + 20;
  }
  x = 16;
  const fav = faviconSvg(src);
  for (const s of [16, 32, 48]) {
    tiles.push({ svg: fav, size: s, left: x, top: 290 });
    x += s + 14;
  }
  x += 20;
  for (const s of [16, 32, 48]) {
    tiles.push({ svg: fav, size: s, left: x, top: 290 });
    x += s + 14;
  }
  return tiles;
}

/** Bytes → base64 (browser and Node both have btoa). */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The whole sheet as one SVG: the dark base, the white favicon card and each tile's PNG at 1:1. */
export function sheetSvg(tiles: { png: Uint8Array; size: number; left: number; top: number }[]): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.width}" height="${SHEET.height}" viewBox="0 0 ${SHEET.width} ${SHEET.height}">` +
    `<rect width="${SHEET.width}" height="${SHEET.height}" fill="${SHEET.background}"/>` +
    `<rect x="166" y="282" width="140" height="64" rx="6" fill="#fff"/>` +
    tiles.map((t) => `<image x="${t.left}" y="${t.top}" width="${t.size}" height="${t.size}" href="data:image/png;base64,${toBase64(t.png)}"/>`).join('') +
    `</svg>`
  );
}

// ---------- opaque PNG (iOS: no alpha channel) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zlib-wrapped deflate (browser: CompressionStream('deflate'); Node: zlib.deflateSync). */
export type Deflate = (data: Uint8Array) => Promise<Uint8Array>;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/**
 * RGBA pixels flattened over `background` into an 8-bit RGB PNG (colour type 2, no alpha), like
 * sharp's `.flatten({ background }).removeAlpha()` for the iOS 1024 icon.
 */
export async function encodeOpaquePng(rgba: ArrayLike<number>, width: number, height: number, background: string, deflate: Deflate): Promise<Uint8Array> {
  const [br, bgc, bb] = hex(background);
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      const o = row + 1 + x * 3;
      raw[o] = Math.round(rgba[i] * a + br * (1 - a));
      raw[o + 1] = Math.round(rgba[i + 1] * a + bgc * (1 - a));
      raw[o + 2] = Math.round(rgba[i + 2] * a + bb * (1 - a));
    }
  }
  const idat = await deflate(raw);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
