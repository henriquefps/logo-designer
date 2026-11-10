import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inkBox, report } from '../measure';
import { buildIconSet } from '../iconSet';
import { resvgRasterize, resvgRenderer } from '../resvgRenderer';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

// Numbers printed by build-icons.mjs (hfps-repo-assets skill) for the same glyphs.
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
      'ios/AppIcon.appiconset/AppIcon-1024.png',
      'ios/AppIcon.appiconset/Contents.json',
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
