// Every output of build-icons.mjs: tile SVGs, Android layers and XML, iOS Contents.json, the .ico
// container and the review sheet. MIRRORS ~/.agents/skills/hfps-repo-assets/assets/build-icons.mjs:
// change both together. Pure string / byte builders, no DOM.
import { faviconFill, fit, type Fit, type InkBox } from './measure';
import {
  ANDROID,
  BRAND,
  FAVICON_RX,
  ICON_COMPOSER_CANVAS,
  IOS_DARK_BG,
  IOS_DARK_GLYPH,
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
}

/** The glyph fitted into a tile of size T at (ox, oy) with `color` for currentColor. */
export const glyphG = (g: PlacedGlyph, T: number, fill: number, color: string, ox = 0, oy = 0) =>
  `<g transform="${fit(g.box, T, fill, ox, oy).attr}">${g.src.replaceAll('currentColor', color)}</g>`;

export interface TileOptions {
  glyph?: PlacedGlyph;
  fill?: number;
  rx?: number;
  bg?: string;
  color?: string;
  border?: boolean;
  size?: number;
}

/** 128 tile: rx 28 blue with a white glyph by default; `border` = the light variant. */
export function tileSvg(src: IconSources, o: TileOptions = {}): string {
  const { glyph = src.glyph, fill = KEYLINE[src.shape].long, rx = TILE_RX, bg = BRAND, color = '#fff', border = false, size = 512 } = o;
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
export const lightTile = (src: IconSources) => tileSvg(src, { border: true, color: BRAND });

/** Favicon tile: rx 24, the small glyph at SMALL_FILL (or the main one at min(0.76, long + 0.08)). */
export const faviconSvg = (src: IconSources) =>
  tileSvg(src, { glyph: src.small ?? src.glyph, fill: faviconFill(src.shape, !!src.small), rx: FAVICON_RX });

/** Android adaptive layer: 108 canvas, visible tile T = 72 centred (18 inset). */
export const layerSvg = (src: IconSources, color: string, withBg = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="432" height="432">` +
  (withBg ? `<rect width="108" height="108" fill="${BRAND}"/>` : '') +
  glyphG(src.glyph, ANDROID.tile, KEYLINE[src.shape].long, color, ANDROID.inset, ANDROID.inset) +
  `</svg>`;

export const legacyLauncherSvg = (src: IconSources) => tileSvg(src, { rx: LEGACY_RX });
export const legacyRoundSvg = (src: IconSources) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512"><circle cx="64" cy="64" r="64" fill="${BRAND}"/>${glyphG(src.glyph, 128, KEYLINE[src.shape].long, '#fff')}</svg>`;

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

export const BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`;

/** The launcher background colour line the script writes (and sets inside an existing file). */
export const BACKGROUND_COLOR_LINE = `<color name="ic_launcher_background">${BRAND}</color>`;

/**
 * values/ic_launcher_background.xml, mirroring build-icons.mjs: with an existing file that has the entry, only
 * that colour is replaced; else, if it has `</resources>`, the entry is inserted before it (other colours such as
 * splash_background are kept); otherwise a fresh file.
 */
export function mergeLauncherBackground(prev: string | null | undefined): string {
  const re = /<color name="ic_launcher_background">[^<]*<\/color>/;
  if (prev && re.test(prev)) return prev.replace(re, BACKGROUND_COLOR_LINE);
  if (prev && prev.includes('</resources>')) return prev.replace('</resources>', `    ${BACKGROUND_COLOR_LINE}\n</resources>`);
  return BACKGROUND_XML;
}

/**
 * Glyph SVG -> Android VectorDrawable (drawable/ic_splash.xml). Handles <path>, <rect>, <circle>, <line>
 * and <g> with inherited fill / stroke / stroke-width / opacity / caps / joins / fill-rule. Transforms are
 * not supported: returns { error } instead of a wrong drawing. MIRRORS splashVector() in build-icons.mjs.
 */
export function splashVector(src: string, f: Fit): { xml: string; error?: undefined } | { error: string; xml?: undefined } {
  const out: string[] = [];
  type St = Record<string, string> & { opacity: number };
  const stack: St[] = [{ fill: '#000', stroke: 'none', 'stroke-width': '1', opacity: 1, 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'fill-rule': 'nonzero' } as unknown as St];
  const attrsOf = (t: string) => Object.fromEntries([...t.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const n = (v: string | undefined) => Number(v ?? 0);
  for (const m of src.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (close) {
      if (tag === 'g') stack.pop();
      continue;
    }
    const a = attrsOf(rest);
    if (a.transform) return { error: `transform on <${tag}>` };
    const cur = { ...stack[stack.length - 1] } as St;
    for (const k of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule']) if (a[k] != null) cur[k] = a[k];
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
    const op = cur.opacity < 1 ? cur.opacity.toFixed(3) : null;
    if (cur.fill !== 'none') {
      p.push(`            android:fillColor="#FFFFFF"`);
      if (cur['fill-rule'] === 'evenodd') p.push(`            android:fillType="evenOdd"`);
      if (op) p.push(`            android:fillAlpha="${op}"`);
    }
    if (cur.stroke !== 'none') {
      p.push(
        `            android:strokeColor="#FFFFFF"`,
        `            android:strokeWidth="${cur['stroke-width']}"`,
        `            android:strokeLineCap="${cur['stroke-linecap']}"`,
        `            android:strokeLineJoin="${cur['stroke-linejoin']}"`,
      );
      if (op) p.push(`            android:strokeAlpha="${op}"`);
    }
    out.push(`        <path\n${p.join('\n')} />`);
  }
  if (!out.length) return { error: 'no shapes' };
  const [tx, ty] = f.attr.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1);
  return {
    xml: `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by build-icons.mjs (hfps-repo-assets) from the app glyph: do not edit by hand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
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
  };
}

/** The splash drawable for a measured glyph: same 108 canvas and fit as the adaptive foreground. */
export const splashDrawable = (src: IconSources) => splashVector(src.glyph.src, fit(src.glyph.box, ANDROID.tile, KEYLINE[src.shape].long, ANDROID.inset, ANDROID.inset));

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

/** iOS 18 Dark: the glyph in IOS_DARK_GLYPH on a TRANSPARENT square (the system supplies the dark background). */
export const iosDarkSvg = (src: IconSources) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024">` +
  glyphG(src.glyph, 128, KEYLINE[src.shape].long, IOS_DARK_GLYPH) +
  `</svg>`;

/** iOS 18 Tinted: grayscale, fully opaque: white glyph on black (flatten on IOS_TINTED_BG, no alpha). */
export const iosTintedSvg = (src: IconSources) => tileSvg(src, { rx: 0, bg: IOS_TINTED_BG, color: IOS_TINTED_GLYPH, size: 1024 });

// ---------- iOS 26: Icon Composer file (AppIcon.icon) ----------

/** Icon Composer colour string: `srgb:r,g,b,a` with 5 decimals, as Icon Composer saves it. */
export function icSrgb(hexColor: string, alpha = 1): string {
  const [r, g, b] = hex(hexColor).map((v) => (v / 255).toFixed(5));
  return `srgb:${r},${g},${b},${alpha.toFixed(5)}`;
}

/** The glyph layer for Icon Composer: full 1024 canvas, transparent, white glyph on the keyline, no mask. */
export const iconComposerGlyphSvg = (src: IconSources) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_COMPOSER_CANVAS} ${ICON_COMPOSER_CANVAS}" width="${ICON_COMPOSER_CANVAS}" height="${ICON_COMPOSER_CANVAS}">` +
  glyphG(src.glyph, ICON_COMPOSER_CANVAS, KEYLINE[src.shape].long, '#ffffff') +
  `</svg>`;

export const ICON_COMPOSER_GLYPH = 'glyph.svg';

/**
 * icon.json of AppIcon.icon: background fill = brand blue (dark: IOS_DARK_BG gradient), one group with
 * the glyph layer (Liquid Glass on, Icon Composer's default shadow/translucency), the glyph recoloured
 * to IOS_DARK_GLYPH in Dark and to white (extended-gray 1) in Tinted. Keys mirror files saved by
 * Icon Composer (see docs/app-icons-theming.md).
 */
export function iconComposerJson(): string {
  const json = {
    'fill-specializations': [
      { value: { solid: icSrgb(BRAND) } },
      { appearance: 'dark', value: { 'linear-gradient': IOS_DARK_BG.map((c) => icSrgb(c)) } },
    ],
    groups: [
      {
        layers: [
          {
            'fill-specializations': [
              { appearance: 'dark', value: { solid: icSrgb(IOS_DARK_GLYPH) } },
              { appearance: 'tinted', value: { solid: 'extended-gray:1.00000,1.00000' } },
            ],
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
  const glyph = glyphG(src.glyph, 128, KEYLINE[src.shape].long, o.light ? BRAND : '#fff');
  const bg = o.light ? `<rect width="128" height="128" fill="#fff"/>` : `<rect width="128" height="128" fill="${BRAND}"/>`;
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
