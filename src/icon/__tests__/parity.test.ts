import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inkBox, report } from '../measure';
import { BACKGROUND_COLOR_LINE, BACKGROUND_XML, mergeLauncherBackground, REFERENCE_CIRCLE_SVG, sheetTiles, splashVector } from '../outputs';
import { buildIconSet } from '../iconSet';
import { BRAND, IOS_DARK_GLYPH, iosDarkGlyphFor, normalizeTile } from '../rules';
import { resvgRasterize, resvgRenderer } from '../resvgRenderer';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

// Numbers printed by build-icons.mjs (hfps-kit skill, repo-assets) for the same glyphs.
const EXPECTED = {
  'glyph-sync.svg': { shape: 'tall', w: '48', h: '68', ink: 11.0, half: '29.9' },
  'glyph-olmapkit.svg': { shape: 'tall', w: '52', h: '68', ink: 8.5, half: '30.8' },
} as const;

describe('parity with build-icons.mjs', () => {
  for (const [file, e] of Object.entries(EXPECTED)) {
    it(`measures ${file} like the script`, async () => {
      const box = await inkBox(fixture(file), resvgRasterize);
      expect(box).not.toBeNull();
      const r = report(box!);
      expect(r.shape).toBe(e.shape);
      expect((r.w * 100).toFixed(0)).toBe(e.w);
      expect((r.h * 100).toFixed(0)).toBe(e.h);
      expect(Math.abs(r.coverage * 100 - e.ink)).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(r.halfDiag.toFixed(1)).toBe(e.half);
      expect(r.lines[r.lines.length - 1]).toBe(`android: glyph half-diagonal ${e.half}dp <= 33dp safe zone`);
      expect(r.warnings).toEqual([]);
    });
  }
});

describe('icon set', () => {
  it('writes every file of the script', async () => {
    const { files, report: r } = await buildIconSet({ glyph: fixture('glyph-sync.svg') }, resvgRenderer);
    const paths = files.map((f) => f.path);
    for (const p of [
      'glyph.svg',
      'docs-img/icon.svg',
      'docs-img/icon-light.svg',
      'docs-img/icon.png',
      'site/favicon.ico',
      'site/icon.svg',
      'site/apple-touch-icon.png',
      'site/icon-192.png',
      'site/icon-512.png',
      'site/icon-maskable-512.png',
      'android/res/mipmap-mdpi/ic_launcher_foreground.png',
      'android/res/mipmap-xxxhdpi/ic_launcher_monochrome.png',
      'android/res/mipmap-hdpi/ic_launcher.png',
      'android/res/mipmap-xhdpi/ic_launcher_round.png',
      'android/res/mipmap-anydpi-v26/ic_launcher.xml',
      'android/res/mipmap-anydpi-v26/ic_launcher_round.xml',
      'android/res/values/ic_launcher_background.xml',
      'android/res/drawable/ic_splash.xml',
      'ios/AppIcon.appiconset/AppIcon-1024.png',
      'ios/AppIcon.appiconset/Contents.json',
      'ios/AppIcon.appiconset/AppIcon-1024-dark.png',
      'ios/AppIcon.appiconset/AppIcon-1024-tinted.png',
      'ios/AppIcon.icon/icon.json',
      'ios/AppIcon.icon/Assets/glyph.svg',
      'review-sheet.png',
      'README.txt',
    ])
      expect(paths).toContain(p);
    expect(r.shape).toBe('tall');
    const readme = files.find((f) => f.path === 'README.txt')!.data as string;
    expect(readme).toMatch(/shape tall: glyph 48% x 68% of the tile, ink (10\.9|11\.0|11\.1)%/);
    // iOS: 1024 RGB (colour type 2), no alpha.
    const ios = files.find((f) => f.path.endsWith('AppIcon-1024.png'))!.data as Uint8Array;
    const v = new DataView(ios.buffer, ios.byteOffset);
    expect(v.getUint32(16)).toBe(1024);
    expect(ios[25]).toBe(2);
    // ICO header: 3 entries.
    const ico = files.find((f) => f.path === 'site/favicon.ico')!.data as Uint8Array;
    expect(new DataView(ico.buffer, ico.byteOffset).getUint16(4, true)).toBe(3);
    expect(ico[6]).toBe(16);
  }, 60_000);
});

describe('review sheet', () => {
  it('draws the reference circle only on the first row-1 mask tile', async () => {
    const box = await inkBox(fixture('glyph-sync.svg'), resvgRasterize);
    const src = { glyph: { src: '<rect x="40" y="40" width="48" height="48"/>', box: box! }, shape: 'tall' as const };
    const row1 = sheetTiles(src).filter((t) => t.top === 16);
    expect(row1).toHaveLength(3);
    expect(row1.map((t) => t.svg.includes(REFERENCE_CIRCLE_SVG))).toEqual([true, false, false]);
  });
});

describe('Android splash VectorDrawable (parity with build-icons.mjs)', () => {
  for (const g of ['sync', 'olmapkit']) {
    it(`ic_splash.xml of glyph-${g}.svg matches the script byte for byte`, async () => {
      const { files } = await buildIconSet({ glyph: fixture(`glyph-${g}.svg`) }, resvgRenderer);
      const f = files.find((x) => x.path === 'android/res/drawable/ic_splash.xml');
      expect(f?.data).toBe(fixture(`ic_splash-${g}.xml`));
    }, 60_000);
  }

  const fitF = { s: 0.5, tx: 10, ty: 20, attr: 'translate(10.000 20.000) scale(0.50000)' };
  it('refuses transforms and unsupported tags instead of drawing wrong', () => {
    expect(splashVector('<g transform="rotate(5)"><path d="M0 0H1V1Z"/></g>', fitF)).toEqual({ error: 'transform on <g>' });
    expect(splashVector('<ellipse cx="1" cy="1" rx="1" ry="2"/>', fitF)).toEqual({ error: 'unsupported <ellipse>' });
    expect(splashVector('', fitF)).toEqual({ error: 'no shapes' });
  });

  it('inherits <g> attributes, maps opacity, fill rule, caps and joins', () => {
    const r = splashVector(
      '<g opacity="0.5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="2" x2="3" y2="4"/></g><circle cx="5" cy="5" r="2" fill-rule="evenodd"/>',
      fitF,
    );
    expect(r.xml).toContain('android:pathData="M1 2L3 4"');
    expect(r.xml).toContain('android:strokeAlpha="0.500"');
    expect(r.xml).toContain('android:strokeLineCap="round"');
    expect(r.xml).toContain('android:fillType="evenOdd"');
    expect(r.xml).toContain('android:translateX="10.000"');
  });
});

describe('ic_launcher_background.xml merge', () => {
  it('sets only ic_launcher_background and keeps other colours', () => {
    const prev = '<resources>\n    <color name="splash_background">#123456</color>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n';
    const out = mergeLauncherBackground(prev);
    expect(out).toContain('<color name="splash_background">#123456</color>');
    expect(out).toContain(BACKGROUND_COLOR_LINE);
    expect(out).not.toContain('#FFFFFF');
  });
  it('inserts the entry before </resources> when the file lacks it, keeping other colours', () => {
    const prev = '<resources>\n    <color name="x">#000</color>\n</resources>\n';
    expect(mergeLauncherBackground(prev)).toBe(prev.replace('</resources>', `    ${BACKGROUND_COLOR_LINE}\n</resources>`));
    expect(mergeLauncherBackground(prev)).toBe(`<resources>\n    <color name="x">#000</color>\n    <color name="ic_launcher_background">#2063b0</color>\n</resources>\n`);
  });
  it('replaces the entry byte-exactly', () => {
    const prev = '<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n';
    expect(mergeLauncherBackground(prev)).toBe('<resources>\n    <color name="ic_launcher_background">#2063b0</color>\n</resources>\n');
  });
  it('writes a fresh file when missing or not a resources file', () => {
    expect(mergeLauncherBackground(null)).toBe(BACKGROUND_XML);
    expect(mergeLauncherBackground('')).toBe(BACKGROUND_XML);
    expect(mergeLauncherBackground('garbage')).toBe(BACKGROUND_XML);
  });
});

// `--tile #5b7a3a` (older hfps repos keep the olive tile): text outputs of build-icons.mjs --tile, byte for byte.
describe('tile colour (--tile) parity with build-icons.mjs', () => {
  const olive = '#5b7a3a';
  const tileFixture = (name: string) => fixture(`tile-olive/${name}`);
  it('every tile / light / launcher / Icon Composer file matches the script', async () => {
    const { files } = await buildIconSet({ glyph: fixture('glyph-sync.svg'), tile: olive }, resvgRenderer);
    const get = (p: string) => files.find((f) => f.path === p)?.data;
    expect(get('docs-img/icon.svg')).toBe(tileFixture('icon.svg'));
    expect(get('docs-img/icon-light.svg')).toBe(tileFixture('icon-light.svg'));
    expect(get('android/res/values/ic_launcher_background.xml')).toBe(tileFixture('ic_launcher_background.xml'));
    expect(get('ios/AppIcon.icon/icon.json')).toBe(tileFixture('icon.json'));
    expect(get('ios/AppIcon.icon/Assets/glyph.svg')).toBe(tileFixture('ios-glyph.svg'));
    expect(get('site/icon.svg')).toBe(tileFixture('icon.svg'));
    expect(String(get('docs-img/icon-light.svg'))).toContain(`fill="${olive}"`);
    expect(String(get('docs-img/icon-light.svg'))).not.toContain(BRAND);
    // no leftover default blue anywhere in the text outputs
    for (const f of files) if (typeof f.data === 'string' && !f.path.endsWith('README.txt') && !f.path.endsWith('.designer.json')) expect(f.data.toLowerCase(), f.path).not.toContain(BRAND);
  }, 60_000);

  it('the default tile is unchanged', async () => {
    const a = await buildIconSet({ glyph: fixture('glyph-sync.svg') }, resvgRenderer);
    const b = await buildIconSet({ glyph: fixture('glyph-sync.svg'), tile: BRAND }, resvgRenderer);
    expect(b.files.map((f) => f.path)).toEqual(a.files.map((f) => f.path));
    for (const [i, f] of a.files.entries()) expect(b.files[i].data, f.path).toEqual(f.data);
    expect(String(a.files.find((f) => f.path === 'docs-img/icon.svg')?.data)).toContain(`fill="${BRAND}"`);
  }, 60_000);

  it('derives the iOS Dark glyph from the tile (same hue / saturation at 62% lightness)', () => {
    expect(iosDarkGlyphFor(BRAND)).toBe(IOS_DARK_GLYPH);
    expect(iosDarkGlyphFor(olive)).toBe('#9fc17b');
    expect(iosDarkGlyphFor('#808080')).toBe('#9e9e9e');
  });

  it('validates the colour', () => {
    expect(normalizeTile('#5B7A3A')).toBe('#5b7a3a');
    expect(normalizeTile('#abc')).toBe('#aabbcc');
    for (const bad of ['5b7a3a', '#5b7a3', '#gggggg', 'red', '', '#5b7a3a80', 12, null]) expect(normalizeTile(bad), String(bad)).toBeNull();
  });

  it('merges the launcher background with the tile', () => {
    expect(mergeLauncherBackground(null, olive)).toBe(tileFixture('ic_launcher_background.xml'));
    expect(mergeLauncherBackground('<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n', olive)).toContain(`>${olive}<`);
  });
});
