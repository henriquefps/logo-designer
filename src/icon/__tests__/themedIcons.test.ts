import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildIconSet, type IconFile } from '../iconSet';
import { icSrgb, IOS_APPICON } from '../outputs';
import { BRAND, IOS_DARK_BG, IOS_DARK_GLYPH } from '../rules';
import { resvgRenderer } from '../resvgRenderer';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const bytes = (files: IconFile[], path: string) => files.find((f) => f.path === path)!.data as Uint8Array;
const text = (files: IconFile[], path: string) => files.find((f) => f.path === path)!.data as string;

/** PNG header: width, height, colour type. */
function pngInfo(png: Uint8Array) {
  const v = new DataView(png.buffer, png.byteOffset);
  return { width: v.getUint32(16), height: v.getUint32(20), colorType: png[25] };
}

/** Decodes a PNG through resvg (wrapped in an SVG <image>) to RGBA pixels. */
function pixels(png: Uint8Array, size: number) {
  const b64 = Buffer.from(png).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image width="${size}" height="${size}" href="data:image/png;base64,${b64}"/></svg>`;
  return new Resvg(svg, { background: 'rgba(0,0,0,0)' }).render().pixels;
}

let files: IconFile[];
beforeAll(async () => {
  files = (await buildIconSet({ glyph: fixture('glyph-sync.svg') }, resvgRenderer)).files;
}, 60_000);

describe('iOS 18 appearances (AppIcon.appiconset)', () => {
  const dir = 'ios/AppIcon.appiconset';

  it('Contents.json lists Light, Dark and Tinted 1024 images with luminosity appearances', () => {
    const json = JSON.parse(text(files, `${dir}/Contents.json`));
    expect(json.info).toEqual({ author: 'hfps build-icons', version: 1 });
    expect(json.images).toEqual([
      { filename: IOS_APPICON.light, idiom: 'universal', platform: 'ios', size: '1024x1024' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: IOS_APPICON.dark, idiom: 'universal', platform: 'ios', size: '1024x1024' },
      { appearances: [{ appearance: 'luminosity', value: 'tinted' }], filename: IOS_APPICON.tinted, idiom: 'universal', platform: 'ios', size: '1024x1024' },
    ]);
    for (const img of json.images) expect(files.some((f) => f.path === `${dir}/${img.filename}`)).toBe(true);
  });

  it('Light is opaque RGB, Dark has a transparent background, Tinted is opaque grayscale', () => {
    const light = bytes(files, `${dir}/${IOS_APPICON.light}`);
    const dark = bytes(files, `${dir}/${IOS_APPICON.dark}`);
    const tinted = bytes(files, `${dir}/${IOS_APPICON.tinted}`);
    for (const p of [light, dark, tinted]) expect(pngInfo(p)).toMatchObject({ width: 1024, height: 1024 });
    expect(pngInfo(light).colorType).toBe(2); // RGB, no alpha
    expect(pngInfo(tinted).colorType).toBe(2);
    expect(pngInfo(dark).colorType).toBe(6); // RGBA

    const N = 128;
    const d = pixels(dark, N);
    expect(d[3]).toBe(0); // corner: transparent
    // opaque pixels are the glyph, in IOS_DARK_GLYPH
    const want = [1, 3, 5].map((i) => parseInt(IOS_DARK_GLYPH.slice(i, i + 2), 16));
    let glyphPx = 0,
      off = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] === 255) {
        glyphPx++;
        off = Math.max(off, Math.abs(d[i] - want[0]) + Math.abs(d[i + 1] - want[1]) + Math.abs(d[i + 2] - want[2]));
      }
    expect(glyphPx).toBeGreaterThan(0);
    expect(off).toBeLessThanOrEqual(12); // resampling only

    const t = pixels(tinted, N);
    let colored = 0,
      white = 0,
      transparent = 0;
    for (let i = 0; i < t.length; i += 4) {
      if (t[i + 3] !== 255) transparent++;
      if (Math.max(Math.abs(t[i] - t[i + 1]), Math.abs(t[i + 1] - t[i + 2])) > 2) colored++;
      if (t[i] > 250) white++;
    }
    expect(transparent).toBe(0);
    expect(colored).toBe(0);
    expect(t[0]).toBe(0); // corner black
    expect(white).toBeGreaterThan(0);
  });
});

describe('iOS 26 Icon Composer file (AppIcon.icon)', () => {
  it('icon.json mirrors Icon Composer’s schema', () => {
    const json = JSON.parse(text(files, 'ios/AppIcon.icon/icon.json'));
    expect(Object.keys(json).sort()).toEqual(['fill-specializations', 'groups', 'supported-platforms']);
    expect(json['fill-specializations']).toEqual([
      { value: { solid: icSrgb(BRAND) } },
      { appearance: 'dark', value: { 'linear-gradient': IOS_DARK_BG.map((c) => icSrgb(c)) } },
    ]);
    expect(json['supported-platforms']).toEqual({ circles: ['watchOS'], squares: 'shared' });
    expect(json.groups).toHaveLength(1);
    const g = json.groups[0];
    expect(g.shadow).toEqual({ kind: 'neutral', opacity: 0.5 });
    expect(g.translucency).toEqual({ enabled: true, value: 0.5 });
    expect(g.layers).toHaveLength(1);
    const layer = g.layers[0];
    expect(layer['image-name']).toBe('glyph.svg');
    expect(layer.glass).toBe(true);
    expect(layer.position).toEqual({ scale: 1, 'translation-in-points': [0, 0] });
    expect(layer['fill-specializations']).toEqual([
      { appearance: 'dark', value: { solid: icSrgb(IOS_DARK_GLYPH) } },
      { appearance: 'tinted', value: { solid: 'extended-gray:1.00000,1.00000' } },
    ]);
    // every image the json names is in Assets/
    expect(files.some((f) => f.path === 'ios/AppIcon.icon/Assets/glyph.svg')).toBe(true);
  });

  it('colour strings use Icon Composer’s srgb:r,g,b,a format', () => {
    expect(icSrgb('#2063b0')).toBe('srgb:0.12549,0.38824,0.69020,1.00000');
    expect(icSrgb('#ffffff', 0.5)).toBe('srgb:1.00000,1.00000,1.00000,0.50000');
  });

  it('the glyph layer is a 1024 canvas, transparent, glyph on the same keyline as the 1024 tile', () => {
    const svg = text(files, 'ios/AppIcon.icon/Assets/glyph.svg');
    expect(svg).toMatch(/viewBox="0 0 1024 1024" width="1024" height="1024"/);
    expect(svg).not.toContain('currentColor');
    expect(svg).not.toMatch(/<rect width="1024"/);
    // render at 256 (memory): tall glyph at 0.68 T → ink height ≈ 0.68 of the canvas
    const N = 256;
    const px = new Resvg(svg, { fitTo: { mode: 'width', value: N }, background: 'rgba(0,0,0,0)' }).render();
    expect(px.width).toBe(N);
    let y0 = N,
      y1 = -1;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (px.pixels[(y * N + x) * 4 + 3] > 24) {
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    expect((y1 - y0 + 1) / N).toBeCloseTo(0.68, 1);
  });
});
