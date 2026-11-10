import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { contrastRatio, contrastWarnings, glyphColours, hexOf } from '../colour';
import { buildIconSet, type IconFile } from '../iconSet';
import { iosDarkColour, splashVector, glyphG } from '../outputs';
import { pathBox } from '../pathBox';
import { resvgRenderer } from '../resvgRenderer';
import { BRAND, GLYPH_DEFAULT } from '../rules';

const fixture = (p: string) => readFileSync(join(__dirname, 'fixtures', p), 'utf8');
const text = (files: IconFile[], path: string) => files.find((f) => f.path === path)!.data as string;
const bytes = (files: IconFile[], path: string) => files.find((f) => f.path === path)!.data as Uint8Array;

/** Cases: input glyph + flags, and the text outputs of build-icons.mjs for them (fixtures/colour/expected). */
const CASES = [
  { name: 'designer-3colour', opts: { full: true, tile: '#1a1a2e' } },
  { name: 'designer-rainbow', opts: { full: true, tile: '#14141f' } },
  { name: 'designer-red-on-white', opts: { glyphColour: '#e5322d', tile: '#ffffff' } },
] as const;

const WANT: [string, string][] = [
  ['docs-img/icon.svg', 'icon.svg'],
  ['docs-img/icon-light.svg', 'icon-light.svg'],
  ['android/res/drawable/ic_splash.xml', 'ic_splash.xml'],
  ['android/res/values/ic_launcher_background.xml', 'ic_launcher_background.xml'],
  ['ios/AppIcon.icon/icon.json', 'icon.json'],
  ['ios/AppIcon.icon/Assets/glyph.svg', 'ios-glyph.svg'],
];

describe('full colour / glyph colour: text outputs match build-icons.mjs byte for byte', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const { files } = await buildIconSet({ glyph: fixture(`colour/glyph-${c.name}.svg`), ...c.opts }, resvgRenderer);
      for (const [path, exp] of WANT) expect(text(files, path), `${c.name}: ${path}`).toBe(fixture(`colour/expected/${c.name}/${exp}`));
      expect(text(files, 'site/icon.svg')).toBe(fixture(`colour/expected/${c.name}/icon.svg`));
    }, 90_000);
  }
});

describe('default (one colour, white on blue) stays byte-identical', () => {
  it('matches the pre-change script output', async () => {
    const { files } = await buildIconSet({ glyph: fixture('glyph-sync.svg') }, resvgRenderer);
    expect(text(files, 'docs-img/icon.svg')).toBe(fixture('default-sync/icon.svg'));
    expect(text(files, 'docs-img/icon-light.svg')).toBe(fixture('default-sync/icon-light.svg'));
    expect(text(files, 'ios/AppIcon.icon/icon.json')).toBe(fixture('default-sync/icon.json'));
    expect(text(files, 'ios/AppIcon.icon/Assets/glyph.svg')).toBe(fixture('default-sync/ios-glyph.svg'));
    expect(text(files, 'android/res/values/ic_launcher_background.xml')).toBe(fixture('default-sync/ic_launcher_background.xml'));
    expect(text(files, 'android/res/drawable/ic_splash.xml')).toBe(fixture('ic_splash-sync.xml'));
  }, 60_000);

  it('an explicit white glyph colour and full: false change nothing', async () => {
    const a = await buildIconSet({ glyph: fixture('glyph-sync.svg') }, resvgRenderer);
    const b = await buildIconSet({ glyph: fixture('glyph-sync.svg'), full: false }, resvgRenderer);
    for (const [i, f] of a.files.entries()) expect(b.files[i].data, f.path).toEqual(f.data);
  }, 60_000);
});

describe('derived variants of a full-colour glyph', () => {
  const N = 108;
  it('Android monochrome is the silhouette: black, alpha only (no colour leaks)', async () => {
    const { files } = await buildIconSet({ glyph: fixture('colour/glyph-designer-rainbow.svg'), full: true, tile: '#14141f' }, resvgRenderer);
    const png = bytes(files, 'android/res/mipmap-mdpi/ic_launcher_monochrome.png');
    const b64 = Buffer.from(png).toString('base64');
    const px = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><image width="${N}" height="${N}" href="data:image/png;base64,${b64}"/></svg>`, { background: 'rgba(0,0,0,0)' }).render().pixels;
    let ink = 0;
    for (let i = 0; i < px.length; i += 4)
      if (px[i + 3] > 200) {
        ink++;
        expect(px[i] + px[i + 1] + px[i + 2]).toBeLessThanOrEqual(6);
      }
    expect(ink).toBeGreaterThan(300);
  }, 60_000);

  it('iOS Tinted is opaque grayscale; iOS Dark keeps the colours on transparency', async () => {
    const { files } = await buildIconSet({ glyph: fixture('colour/glyph-designer-3colour.svg'), full: true, tile: '#1a1a2e' }, resvgRenderer);
    const dir = 'ios/AppIcon.appiconset';
    const view = (path: string, n: number) => {
      const b64 = Buffer.from(bytes(files, `${dir}/${path}`)).toString('base64');
      return new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><image width="${n}" height="${n}" href="data:image/png;base64,${b64}"/></svg>`, { background: 'rgba(0,0,0,0)' }).render().pixels;
    };
    const t = view('AppIcon-1024-tinted.png', 128);
    let lit = 0;
    for (let i = 0; i < t.length; i += 4) {
      expect(Math.max(Math.abs(t[i] - t[i + 1]), Math.abs(t[i + 1] - t[i + 2]))).toBeLessThanOrEqual(2);
      if (t[i] > 60) lit++;
    }
    expect(lit).toBeGreaterThan(200); // the glyph survives as gray, not lost on the black
    const d = view('AppIcon-1024-dark.png', 128);
    expect(d[3]).toBe(0); // transparent corner
    const seen = new Set<string>();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255) seen.add(['r', 'g', 'b'].map((_, k) => (d[i + k] > 150 ? 1 : 0)).join(''));
    expect(seen.size).toBeGreaterThanOrEqual(3); // red-ish, yellow-ish and cyan-ish shapes, not one colour
  }, 60_000);

  it('Icon Composer keeps the layer colours in full colour (no dark / tinted recolour)', async () => {
    const { files } = await buildIconSet({ glyph: fixture('colour/glyph-designer-3colour.svg'), full: true }, resvgRenderer);
    const layer = JSON.parse(text(files, 'ios/AppIcon.icon/icon.json')).groups[0].layers[0];
    expect(layer['fill-specializations']).toBeUndefined();
    expect(layer.glass).toBe(true);
    expect(text(files, 'ios/AppIcon.icon/Assets/glyph.svg')).toContain('fill="#ff5a5f"');
  }, 60_000);

  it('the glyph of a one-colour icon uses the glyph colour everywhere it is white today', async () => {
    const { files } = await buildIconSet({ glyph: fixture('glyph-sync.svg'), glyphColour: '#ff0000', tile: '#ffffff' }, resvgRenderer);
    expect(text(files, 'docs-img/icon.svg')).toContain('fill="#ff0000"');
    expect(text(files, 'docs-img/icon.svg')).not.toContain('#fff"><');
    expect(text(files, 'android/res/drawable/ic_splash.xml')).toContain('android:fillColor="#FFFFFF"'); // one colour: the splash is tinted by the system theme
    expect(text(files, 'ios/AppIcon.icon/Assets/glyph.svg')).toContain('fill="#ff0000"');
    // Dark: a glyph colour that reads on the dark background (>= 3:1) is kept, pure red (2.5:1) is lightened
    const box = { x: 0, y: 0, w: 1, h: 1, inkArea: 1 };
    expect(iosDarkColour({ glyph: { src: '', box }, shape: 'square', glyphColour: '#ff8a80' })).toBe('#ff8a80');
    expect(iosDarkColour({ glyph: { src: '', box }, shape: 'square', glyphColour: '#ff0000' })).toBe('#ff3d3d');
    // a dark glyph colour is lightened for Dark
    expect(iosDarkColour({ glyph: { src: '', box: { x: 0, y: 0, w: 1, h: 1, inkArea: 1 } }, shape: 'square', glyphColour: '#202020' })).toBe('#9e9e9e');
  }, 60_000);

  it('silhouette and gray inks add a filter with an explicit region', () => {
    const g = { src: '<path d="M0 0H1V1Z" fill="#f00"/>', box: { x: 0, y: 0, w: 1, h: 1, inkArea: 1 } };
    const sil = glyphG(g, 128, 0.6, { silhouette: '#000' });
    expect(sil).toContain('<filter id="ink-silhouette" filterUnits="userSpaceOnUse"');
    expect(sil).toContain('values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"');
    expect(glyphG(g, 128, 0.6, { gray: true })).toContain('0.2126 0.7152 0.0722 0 0');
    expect(glyphG(g, 128, 0.6, '#fff')).toBe(`<g transform="translate(25.600 25.600) scale(76.80000)"><path d="M0 0H1V1Z" fill="#f00"/></g>`);
  });
});

describe('Android splash VectorDrawable with colours', () => {
  const f = { s: 0.5, tx: 10, ty: 20, attr: 'translate(10.000 20.000) scale(0.50000)' };
  it('one colour: still white, whatever the paints (byte-identical to before)', () => {
    expect(splashVector('<path d="M0 0H10V10Z" fill="#ff0000"/>', f).xml).toContain('android:fillColor="#FFFFFF"');
  });
  it('full colour: solids keep colour and alpha', () => {
    const r = splashVector('<path d="M0 0H10V10Z" fill="#ff0000" fill-opacity="0.5"/><circle cx="5" cy="5" r="2" fill="#0a0" opacity="0.5"/>', f, true);
    expect(r.xml).toContain('android:fillColor="#FF0000"');
    expect(r.xml).toContain('android:fillAlpha="0.500"');
    expect(r.xml).toContain('android:fillColor="#00AA00"');
    expect(r.xml).not.toContain('aapt');
  });
  it('full colour: linear gradient on the bounding box as aapt:attr', () => {
    const r = splashVector(
      '<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff" stop-opacity="0.5"/></linearGradient></defs><rect x="10" y="20" width="40" height="30" fill="url(#g1)"/>',
      f,
      true,
    );
    expect(r.xml).toContain('xmlns:aapt="http://schemas.android.com/aapt"');
    expect(r.xml).toContain('<aapt:attr name="android:fillColor">');
    expect(r.xml).toContain('android:startX="10"');
    expect(r.xml).toContain('android:endX="50"');
    expect(r.xml).toContain('android:startY="20"');
    expect(r.xml).toContain('android:color="#FF0000"'); // opaque stop: #RRGGBB
    expect(r.xml).toContain('android:color="#800000FF"'); // 50 % alpha stop: #AARRGGBB
    expect(r.warnings).toBeUndefined();
  });
  it('full colour: radial gradient', () => {
    const r = splashVector(
      '<radialGradient id="r" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><circle cx="20" cy="20" r="10" fill="url(#r)"/>',
      f,
      true,
    );
    expect(r.xml).toContain('android:type="radial"');
    expect(r.xml).toContain('android:centerX="20"');
    expect(r.xml).toContain('android:gradientRadius="10"');
  });
  it('full colour: untranslatable paints fall back to white with a warning', () => {
    const r = splashVector('<linearGradient id="g" gradientTransform="rotate(10)"><stop offset="0" stop-color="#f00"/></linearGradient><path d="M0 0H10V10Z" fill="url(#g)"/><path d="M0 0H5V5Z" fill="hotpink"/>', f, true);
    expect(r.xml).toContain('android:fillColor="#FFFFFF"');
    expect(r.warnings).toEqual(['gradientTransform is not supported: gradient painted white', 'colour “hotpink” is not a hex colour: painted white']);
  });
  it('buildIconSet reports splash warnings as notes', async () => {
    const glyph = '<linearGradient id="g" gradientTransform="rotate(10)"><stop offset="0" stop-color="#f00"/></linearGradient><circle cx="64" cy="64" r="30" fill="url(#g)"/>';
    const { notes } = await buildIconSet({ glyph, full: true }, resvgRenderer);
    expect(notes).toEqual(['! android splash: gradientTransform is not supported: gradient painted white']);
  }, 60_000);
});

describe('pathBox', () => {
  it('bounds lines, curves and arcs', () => {
    expect(pathBox('M10 20H50V60H10Z')).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    const c = pathBox('M0 0C0 10 10 10 10 0')!;
    expect(c.w).toBeCloseTo(10, 5);
    expect(c.h).toBeCloseTo(7.5, 1); // curve peaks at 0.75 of the control height
    const circle = pathBox('M10 20A10 10 0 1 0 30 20A10 10 0 1 0 10 20Z')!;
    expect(circle.x).toBeCloseTo(10, 1);
    expect(circle.w).toBeCloseTo(20, 1);
    expect(circle.h).toBeCloseTo(20, 0);
    expect(pathBox('')).toBeNull();
  });
});

describe('contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio(GLYPH_DEFAULT, BRAND)).toBeGreaterThan(5); // white on hfps blue is fine
  });
  it('warns for a glyph that nearly vanishes on its tile', () => {
    expect(contrastWarnings({ glyph: '', full: false })).toEqual([]);
    const w = contrastWarnings({ glyph: '', full: false, glyphColour: '#ffffff', tile: '#ffffff' });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^ {2}! contrast: the glyph colour too close to the tile #ffffff \(#ffffff 1\.0:1;/);
    expect(contrastWarnings({ glyph: '', full: false, glyphColour: '#ff0000', tile: '#ffffff' })).toEqual([]); // 4:1
  });
  it('checks every colour and gradient stop of a full-colour glyph', () => {
    const g = '<path fill="#ffffff"/><linearGradient><stop stop-color="#2063b0"/><stop stop-color="#ff0000"/></linearGradient><path stroke="#2063b0" fill="none"/>';
    expect(glyphColours(g)).toEqual(['#ffffff', '#2063b0', '#ff0000']);
    const w = contrastWarnings({ glyph: g, full: true, tile: '#2063b0' });
    expect(w[0]).toContain('#2063b0 1.0:1');
    expect(w[0]).toContain('#ff0000');
    expect(w[0]).not.toContain('#ffffff');
  });
  it('is part of the report', async () => {
    const { report } = await buildIconSet({ glyph: fixture('glyph-sync.svg'), glyphColour: '#2063b0' }, resvgRenderer);
    expect(report.warnings.some((w) => w.includes('contrast'))).toBe(true);
    expect(report.lines.some((l) => l.includes('contrast'))).toBe(true);
    const ok = await buildIconSet({ glyph: fixture('glyph-sync.svg') }, resvgRenderer);
    expect(ok.report.warnings).toEqual([]);
  }, 60_000);
  it('hexOf accepts #rgb, #rrggbb(aa), white and black', () => {
    expect([hexOf('#FFF'), hexOf('#aabbcc80'), hexOf('white'), hexOf('hotpink')]).toEqual(['#ffffff', '#aabbcc', '#ffffff', null]);
  });
});
