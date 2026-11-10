// Every output of build-icons.mjs: tile SVGs, Android layers and XML, iOS Contents.json, the .ico
// container and the review sheet. MIRRORS ~/.agents/skills/hfps-repo-assets/assets/build-icons.mjs:
// change both together. Pure string / byte builders, no DOM.
import { faviconFill, fit, type InkBox } from './measure';
import { ANDROID, BRAND, FAVICON_RX, KEYLINE, LEGACY_RX, LIGHT_BORDER, REFERENCE_CIRCLE, REFERENCE_PINK, TILE_RX, type IconShape } from './rules';

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

export const IOS_CONTENTS_JSON =
  JSON.stringify(
    {
      images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
      info: { author: 'hfps build-icons', version: 1 },
    },
    null,
    2,
  ) + '\n';

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
  for (const m of masks) {
    tiles.push({ svg: maskedSvg(src, m, true), size: 128, left: x, top: 16 });
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
