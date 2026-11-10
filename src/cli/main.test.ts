// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { decodePayload, readLaunchRequest } from '@/io/shareLink';
import { main, startGallery, startServer } from './main';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#2f6fb5"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
  <rect x="8" y="8" width="112" height="112" rx="24" fill="url(#g)"/>
  <g id="mark"><path d="M32 96 C32 60 64 32 96 32" stroke="#ffffff" stroke-width="10" fill="none"/><circle cx="96" cy="32" r="8" fill="#ff0000"/></g>
</svg>`;

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'designer-cli-'));
  await writeFile(join(dir, 'glyph.svg'), SVG);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

async function cli(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: dir, stdin: async () => SVG });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const json = async (f: string) => JSON.parse(await readFile(join(dir, f), 'utf8'));

describe('designer CLI', () => {
  it('prints usage', async () => {
    expect((await cli('help')).out).toContain('from-svg');
    expect((await cli()).code).toBe(1);
    expect((await cli('frobnicate')).code).toBe(2);
    expect((await cli('new', '--bogus')).code).toBe(2);
  });

  it('new: presets and sizes', async () => {
    const r = await cli('new', '--preset', 'app-icon', '-o', 'icon.designer.json');
    expect(r.code).toBe(0);
    const doc = await json('icon.designer.json');
    expect(doc).toMatchObject({ $schema: expect.stringContaining('designer-project.schema.json'), name: 'icon', artboard: { width: 128, height: 128, background: { kind: 'none' } }, icon: { preset: 'app-icon', shape: 'auto' }, children: [] });
    const wide = JSON.parse((await cli('new', '--preset', '1920x1080', '--name', 'Banner')).out);
    expect(wide).toMatchObject({ name: 'Banner', artboard: { width: 1920, height: 1080 } });
    expect(wide.icon).toBeUndefined();
    const bad = await cli('new', '--preset', 'huge');
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/Unknown preset/);
  });

  it('knockout: cuts the objects behind the cutter, by id or name, with a gap', async () => {
    const two = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <rect id="back" x="20" y="20" width="60" height="60" opacity="0.45"/>
  <rect id="front" x="48" y="48" width="60" height="60"/>
</svg>`;
    await writeFile(join(dir, 'two.svg'), two);
    expect((await cli('from-svg', 'two.svg', '-o', 'two.designer.json', '--icon', 'app-icon')).code).toBe(0);
    const info = await cli('info', 'two.designer.json');
    const ids = [...info.out.matchAll(/\[([^\]]+)\]$/gm)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(info.out).toContain('“front”');

    const r = await cli('knockout', 'two.designer.json', '--cutter', 'front', '-o', 'cut.designer.json');
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/Knockout by “front” \(gap 3\.84 units = 0\.03T\)/);
    expect(r.err).toMatch(/cut: “back”/);
    const doc = await json('cut.designer.json');
    expect(doc.icon).toEqual({ preset: 'app-icon', shape: 'auto' });
    expect(doc.children[0]).toMatchObject({ id: ids[0], type: 'path', name: 'back', opacity: 0.45, fill: { kind: 'solid' }, stroke: { paint: { kind: 'none' } } });
    expect(doc.children[1]).toMatchObject({ id: ids[1], type: 'rect' }); // the cutter is unchanged
    expect((await cli('validate', 'cut.designer.json')).code).toBe(0);

    // By id, explicit targets and a gap in document units or tile fractions.
    const byId = await cli('knockout', 'two.designer.json', '--cutter', ids[1], '--targets', ids[0], '--gap', '0.05T');
    expect(byId.code).toBe(0);
    expect(byId.err).toMatch(/gap 6\.4 units = 0\.05T/);
    expect((await cli('knockout', 'two.designer.json', '--cutter', 'front', '--gap', '2')).err).toMatch(/gap 2 units/);

    // Errors: unknown names, missing --cutter, bad gap.
    expect((await cli('knockout', 'two.designer.json', '--cutter', 'nope')).err).toMatch(/no object with that id or name/);
    expect((await cli('knockout', 'two.designer.json')).code).toBe(2);
    expect((await cli('knockout', 'two.designer.json', '--cutter', 'front', '--gap', '-1')).code).toBe(2);
  });

  it('from-svg: clip paths become real geometry (no clipPath in the project)', async () => {
    const clipped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="50" height="100"/></clipPath></defs><rect width="100" height="100" fill="#000" clip-path="url(#c)"/></svg>`;
    await writeFile(join(dir, 'clipped.svg'), clipped);
    const r = await cli('from-svg', 'clipped.svg');
    expect(r.code).toBe(0);
    expect(r.err).not.toMatch(/Warning/);
    const doc = JSON.parse(r.out);
    expect(doc.children[0].type).toBe('path');
    const svg = (await cli('to-svg', 'clipped.svg')).out;
    expect(svg).not.toMatch(/clip/i);
    expect(svg).toMatch(/M0 0L50 0L50 100L0 100Z|width="50"/);
  });

  it('from-svg: editable project with groups, paths and gradients', async () => {
    const r = await cli('from-svg', 'glyph.svg', '-o', 'glyph.designer.json', '--icon', 'favicon-32');
    expect(r.code).toBe(0);
    const doc = await json('glyph.designer.json');
    expect(doc.name).toBe('glyph');
    expect(doc.icon).toEqual({ preset: 'favicon-32', shape: 'auto' });
    expect(doc.children.map((c: { type: string }) => c.type)).toEqual(['rect', 'group']);
    expect(doc.children[0].fill.kind).toBe('linear');
    expect(doc.children[1].children.map((c: { type: string }) => c.type)).toEqual(['path', 'ellipse']);
    expect((await cli('from-svg', '-', '--name', 'Piped')).out).toContain('"name": "Piped"');
    expect((await cli('from-svg', 'glyph.svg', '--icon', 'poster')).code).toBe(2);
  });

  it('validate: ok, and errors that name the JSON path', async () => {
    await cli('from-svg', 'glyph.svg', '-o', 'ok.designer.json');
    const bad = await json('ok.designer.json');
    bad.children[1].children[1].rx = 'big';
    await writeFile(join(dir, 'bad.designer.json'), JSON.stringify(bad));
    const r = await cli('validate', 'ok.designer.json', 'bad.designer.json', 'glyph.svg');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^ok {3}ok\.designer\.json: “glyph”, 128×128, 4 objects/m);
    expect(r.out).toContain('FAIL bad.designer.json: This project file is damaged at children[1].children[1].rx: expected a number, got "big".');
    expect(r.out).toMatch(/FAIL glyph\.svg: .*from-svg/);
    expect((await cli('validate', 'ok.designer.json')).code).toBe(0);
  });

  it('info: tree and bounds', async () => {
    await cli('from-svg', 'glyph.svg', '-o', 'info.designer.json');
    const r = await cli('info', 'info.designer.json');
    expect(r.out).toContain('artboard 128×128, background transparent');
    expect(r.out).toContain('content bounds: x 8 y 8 w 112 h 112');
    expect(r.out).toMatch(/ellipse “Ellipse” rx 8 ry 8 — x 88 y 24 w 16 h 16/);
    const j = JSON.parse((await cli('info', 'info.designer.json', '--json')).out);
    expect(j.nodes[1].children[1].bounds).toEqual({ x: 88, y: 24, width: 16, height: 16 });
  });

  it('to-svg: clean SVG and a currentColor glyph', async () => {
    await cli('from-svg', 'glyph.svg', '-o', 'svg.designer.json');
    const svg = (await cli('to-svg', 'svg.designer.json')).out;
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="128" height="128" viewBox="0 0 128 128">/);
    expect(svg).toContain('<linearGradient');
    const glyph = (await cli('to-svg', 'svg.designer.json', '--glyph')).out;
    expect(glyph).not.toContain('<svg');
    expect(glyph).not.toMatch(/#[0-9a-f]{6}|url\(/i);
    expect(glyph).toContain('fill="currentColor"');
    expect(glyph).toContain('stroke="currentColor"');
    expect(glyph).toContain('fill="none"');
    // A 256 artboard is scaled into the 128 box.
    const big = await json('svg.designer.json');
    big.artboard = { width: 256, height: 128, background: { kind: 'none' } };
    await writeFile(join(dir, 'big.designer.json'), JSON.stringify(big));
    expect((await cli('to-svg', 'big.designer.json', '--glyph')).out).toMatch(/^<g transform="matrix\(0\.5 0 0 0\.5 0 32\)">/);
  });

  it('round-trips build-icons glyph fragments (no <svg> root, default black fill)', async () => {
    await writeFile(join(dir, 'frag.svg'), '<!-- glyph -->\n<rect x="8" y="92" width="20" height="20" rx="4" fill="currentColor"/>\n<path d="M18 102 H110" stroke="currentColor" stroke-width="7"/>');
    const r = await cli('from-svg', 'frag.svg', '-o', 'frag.designer.json');
    expect(r.err).toContain('glyph fragment');
    expect((await json('frag.designer.json')).artboard).toMatchObject({ width: 128, height: 128 });
    const glyph = (await cli('to-svg', 'frag.designer.json', '--glyph')).out;
    expect(glyph).toMatch(/^<rect x="8" y="92" width="20" height="20" rx="4" fill="currentColor"\/>/);
    expect(glyph).toContain('stroke="currentColor"');
  });

  it('icons: the whole icon set, same tree and numbers as build-icons.mjs', async () => {
    const sync = readFileSync(join(__dirname, '../icon/__tests__/fixtures/glyph-sync.svg'), 'utf8');
    await writeFile(join(dir, 'sync.svg'), sync);
    await cli('from-svg', 'sync.svg', '-o', 'sync.designer.json', '--icon', 'app-icon', '--no-fit');
    const r = await cli('icons', 'sync.designer.json', '-o', 'icons');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^shape tall: glyph 48% x 68% of the tile, ink (10\.9|11\.0|11\.1)%$/m);
    expect(r.out).toContain('android: glyph half-diagonal 29.9dp <= 33dp safe zone');
    for (const f of ['glyph.svg', 'docs-img/icon.svg', 'site/favicon.ico', 'android/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 'ios/AppIcon.appiconset/Contents.json', 'ios/AppIcon.appiconset/AppIcon-1024-tinted.png', 'ios/AppIcon.icon/icon.json', 'review-sheet.png', 'README.txt', 'sync.designer.json'])
      expect((await readFile(join(dir, 'icons', f))).length).toBeGreaterThan(0);
    // The glyph is byte-identical to `to-svg --glyph`.
    expect(await readFile(join(dir, 'icons/glyph.svg'), 'utf8')).toBe((await cli('to-svg', 'sync.designer.json', '--glyph')).out + '\n');
    // The Designer's own glyph export is plain paths, so the splash converter succeeds (no `!` note).
    expect(await readFile(join(dir, 'icons/android/res/drawable/ic_splash.xml'), 'utf8')).toContain('<vector');
    expect(r.out).not.toContain('! android splash');
    expect((await cli('icons', 'sync.designer.json')).code).toBe(2);

    // --android writes straight into an app's res dir and keeps the other colours.
    await mkdir(join(dir, 'app/res/values'), { recursive: true });
    await writeFile(join(dir, 'app/res/values/ic_launcher_background.xml'), '<resources>\n    <color name="splash_background">#010203</color>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n');
    const a = await cli('icons', 'sync.designer.json', '--android', 'app/res');
    expect(a.code).toBe(0);
    expect((await readFile(join(dir, 'app/res/drawable/ic_splash.xml'), 'utf8')).length).toBeGreaterThan(0);
    expect((await readFile(join(dir, 'app/res/mipmap-xxxhdpi/ic_launcher_foreground.png'))).length).toBeGreaterThan(0);
    const bg = await readFile(join(dir, 'app/res/values/ic_launcher_background.xml'), 'utf8');
    expect(bg).toContain('splash_background">#010203');
    expect(bg).toContain('name="ic_launcher_background"');
  }, 60_000);

  it('icons --tile: one colour for every tile, stored in the project, validated', async () => {
    const sync = readFileSync(join(__dirname, '../icon/__tests__/fixtures/glyph-sync.svg'), 'utf8');
    await writeFile(join(dir, 'sync2.svg'), sync);
    await cli('from-svg', 'sync2.svg', '-o', 'tile.designer.json', '--icon', 'app-icon', '--no-fit');
    expect((await json('tile.designer.json')).icon).toEqual({ preset: 'app-icon', shape: 'auto' });
    const r = await cli('icons', 'tile.designer.json', '-o', 'icons-olive', '--tile', '#5B7A3A', '--ios', 'ios-olive');
    expect(r.code).toBe(0);
    const text = (f: string) => readFile(join(dir, f), 'utf8');
    expect(await text('icons-olive/docs-img/icon.svg')).toContain('fill="#5b7a3a"');
    expect(await text('icons-olive/docs-img/icon-light.svg')).toContain('fill="#5b7a3a"');
    expect(await text('icons-olive/android/res/values/ic_launcher_background.xml')).toContain('>#5b7a3a<');
    expect(await text('ios-olive/AppIcon.icon/icon.json')).toContain('srgb:0.62353,0.75686,0.48235,1.00000'); // derived Dark glyph #9fc17b
    // default unchanged
    expect(await text('icons/docs-img/icon.svg')).toContain('fill="#2063b0"');
    // invalid colours are a usage error
    for (const bad of ['olive', '5b7a3a', '#12345']) {
      const e = await cli('icons', 'tile.designer.json', '-o', 'icons-bad', '--tile', bad);
      expect(e.code).toBe(2);
      expect(e.err).toMatch(/--tile must be a hex colour/);
    }
    // stored in the project: used by default, --tile overrides it
    expect((await cli('new', '--preset', 'app-icon', '--tile', '#5b7a3a', '-o', 'olive.designer.json')).code).toBe(0);
    expect((await json('olive.designer.json')).icon).toEqual({ preset: 'app-icon', shape: 'auto', tile: '#5b7a3a' });
    const doc = await json('tile.designer.json');
    await writeFile(join(dir, 'tile-stored.designer.json'), JSON.stringify({ ...doc, icon: { ...doc.icon, tile: '#5b7a3a' } }));
    await cli('icons', 'tile-stored.designer.json', '-o', 'icons-stored');
    expect(await text('icons-stored/docs-img/icon.svg')).toContain('fill="#5b7a3a"');
    await cli('icons', 'tile-stored.designer.json', '-o', 'icons-override', '--tile', '#2063b0');
    expect(await text('icons-override/docs-img/icon.svg')).toContain('fill="#2063b0"');
    expect((await cli('validate', 'olive.designer.json')).code).toBe(0);
    await writeFile(join(dir, 'badtile.designer.json'), JSON.stringify({ ...doc, icon: { ...doc.icon, tile: 'nope' } }));
    const v = await cli('validate', 'badtile.designer.json');
    expect(v.code).toBe(1);
    expect(v.out).toContain('icon.tile');
  }, 120_000);

  it('to-png renders with resvg', async () => {
    await cli('from-svg', 'glyph.svg', '-o', 'png.designer.json');
    const r = await cli('to-png', 'png.designer.json', '--size', '64');
    expect(r.code).toBe(0);
    const png = await readFile(join(dir, 'png-64.png'));
    expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(64); // IHDR width
    expect((await cli('to-png', 'png.designer.json')).code).toBe(2);
  });

  it('link: #open= for projects and SVGs, ?import= for URLs', async () => {
    await cli('from-svg', 'glyph.svg', '-o', 'link.designer.json');
    const link = (await cli('link', 'link.designer.json', '--origin', 'http://localhost:5173')).out;
    expect(link.startsWith('http://localhost:5173/#open=')).toBe(true);
    const req = readLaunchRequest(link);
    const doc = JSON.parse(await decodePayload(req!.kind === 'data' ? req!.data : ''));
    expect(doc.name).toBe('glyph');
    expect(doc.children).toHaveLength(2);

    const svgLink = readLaunchRequest((await cli('link', 'glyph.svg')).out);
    expect(svgLink).toMatchObject({ kind: 'data', name: 'glyph' });
    expect(await decodePayload(svgLink!.kind === 'data' ? svgLink!.data : '')).toBe(SVG);

    expect((await cli('link', '--url', 'https://raw.githubusercontent.com/o/r/main/scripts/glyph.designer.json')).out).toBe(
      'https://designer.hfps.dev/?import=https%3A%2F%2Fraw.githubusercontent.com%2Fo%2Fr%2Fmain%2Fscripts%2Fglyph.designer.json',
    );
    expect((await cli('link', 'missing.json')).code).toBe(2);
  });

  it('serve: one file with CORS and Private Network Access headers', async () => {
    const { server, url } = await startServer('glyph.svg', 0, { cwd: dir });
    try {
      const res = await fetch(url);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(await res.text()).toBe(SVG);
      const pre = await fetch(url, { method: 'OPTIONS' });
      expect(pre.headers.get('access-control-allow-private-network')).toBe('true');
      expect((await fetch(url.replace('glyph.svg', 'other.svg'))).status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe('open / present', () => {
  it('open: one file launches the browser and prints a short confirmation', async () => {
    const opened: string[] = [];
    const out: string[] = [];
    const code = await main(['open', 'glyph.svg'], { out: (s) => out.push(s), err: () => {}, cwd: dir, openUrl: async (u) => (opened.push(u), true) });
    expect(code).toBe(0);
    expect(out.join('')).toBe("Opened 'glyph' in Designer — confirm the import in the browser.");
    expect(opened).toHaveLength(1);
    expect(readLaunchRequest(opened[0])).toMatchObject({ kind: 'data', name: 'glyph' });
  });

  it('link warns on stderr only when stdout is a TTY', async () => {
    const run = async (isTTY: boolean) => {
      const err: string[] = [];
      await main(['link', 'glyph.svg'], { out: () => {}, err: (s) => err.push(s), cwd: dir, isTTY });
      return err.join('');
    };
    expect(await run(true)).toContain('designer open');
    expect(await run(false)).toBe('');
  });

  it('startGallery serves the gallery, previews and files with CORS', async () => {
    await cli('from-svg', 'glyph.svg', '-o', 'second.designer.json', '--name', 'Second');
    const { server, url } = await startGallery(['glyph.svg', 'second.designer.json'], 0, 'https://app.test', { cwd: dir });
    try {
      const page = await fetch(url);
      const html = await page.text();
      expect(html.match(/class="card"/g)).toHaveLength(2);
      expect(html).toContain('Second');
      const m = html.match(/href="(https:\/\/app\.test\/\?import=[^"]+)"/)!;
      const target = new URL(m[1].replace(/&amp;/g, '&')).searchParams.get('import')!;
      expect(target.startsWith(url.slice(0, -1))).toBe(true);
      const f = await fetch(target);
      expect(f.headers.get('access-control-allow-origin')).toBe('*');
      expect(await f.text()).toContain('<svg');
      const p = await fetch(`${url}preview/1.svg`);
      expect(p.headers.get('content-type')).toBe('image/svg+xml');
      expect((await fetch(`${url}nope`)).status).toBe(404);
    } finally {
      server.close();
    }
  });

  describe('keyline fitting', () => {
    const SMALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" stroke="#fff" stroke-width="4" fill="none"><rect x="10" y="10" width="30" height="40"/><circle cx="30" cy="30" r="8" fill="#f00"/></svg>`;
    const doc = async (f: string) => JSON.parse(await readFile(join(dir, f), 'utf8'));
    const strokeOf = (d: { children: { stroke?: { width: number } }[] }) => d.children[0].stroke!.width;

    it('from-svg --icon fits by default; --no-fit keeps the raw drawing', async () => {
      await writeFile(join(dir, 'small.svg'), SMALL);
      const fitted = await cli('from-svg', 'small.svg', '-o', 'fit.designer.json', '--icon', 'app-icon');
      expect(fitted.code).toBe(0);
      expect(fitted.err).toMatch(/fitted to the keyline.*on keyline: no.*on keyline: yes/);
      const raw = await cli('from-svg', 'small.svg', '-o', 'raw.designer.json', '--icon', 'app-icon', '--no-fit');
      expect(raw.err).not.toContain('fitted');
      expect((await cli('info', 'fit.designer.json')).out).toContain('on keyline: yes');
      expect((await cli('info', 'raw.designer.json')).out).toMatch(/on keyline: no.*run `designer fit`/);
      // Without --icon nothing is fitted (not an icon project).
      expect((await cli('from-svg', 'small.svg', '--no-fit')).code).toBe(0);
      // Strokes scale with the glyph.
      expect(strokeOf(await doc('fit.designer.json'))).toBeGreaterThan(strokeOf(await doc('raw.designer.json')) * 1.5);
      expect(JSON.parse((await cli('info', 'raw.designer.json', '--json')).out).keyline.onKeyline).toBe(false);
    }, 60_000);

    it('fit: in place, to -o, idempotent, validate notes off-keyline', async () => {
      await cli('from-svg', 'small.svg', '-o', 'a.designer.json', '--icon', 'app-icon', '--no-fit');
      const v = await cli('validate', 'a.designer.json');
      expect(v.code).toBe(0);
      expect(v.out).toMatch(/note: the glyph is off its keyline/);
      const r = await cli('fit', 'a.designer.json', '-o', 'b.designer.json');
      expect(r.code).toBe(0);
      expect(r.err).toMatch(/before: .*on keyline: no\nafter: .*on keyline: yes/);
      expect((await cli('validate', 'b.designer.json')).out).not.toContain('note:');
      // Idempotent: fitting a fitted project changes nothing (within float noise) and stays on the keyline.
      await cli('fit', 'b.designer.json', '-o', 'c.designer.json');
      const b = await doc('b.designer.json');
      const c = await doc('c.designer.json');
      expect(strokeOf(c)).toBeCloseTo(strokeOf(b), 1);
      expect(c.children[0].transform.x).toBeCloseTo(b.children[0].transform.x, 1);
      // In place by default.
      expect((await cli('fit', 'a.designer.json')).code).toBe(0);
      expect((await cli('info', 'a.designer.json')).out).toContain('on keyline: yes');
    }, 60_000);

    it('fit: clear errors for non-icons and empty glyphs', async () => {
      await cli('new', '--preset', '512x512', '-o', 'plain.designer.json');
      const r = await cli('fit', 'plain.designer.json');
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/not an app icon project/);
      await cli('new', '--preset', 'app-icon', '-o', 'empty.designer.json');
      const e = await cli('fit', 'empty.designer.json');
      expect(e.code).toBe(1);
      expect(e.err).toMatch(/no visible ink/);
      expect((await cli('fit')).code).toBe(2);
    });

    it('icons measures the same whether or not the project was fitted first', async () => {
      await cli('from-svg', 'small.svg', '-o', 'm-raw.designer.json', '--icon', 'app-icon', '--no-fit');
      await cli('fit', 'm-raw.designer.json', '-o', 'm-fit.designer.json');
      const a = await cli('icons', 'm-raw.designer.json', '-o', 'icons-raw');
      const b = await cli('icons', 'm-fit.designer.json', '-o', 'icons-fit');
      expect(a.code).toBe(0);
      // Same report: the glyph is fitted by `icons` itself, so only raster quantization (≤ 1 %) may differ.
      const nums = (t: string) => (t.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      const [na, nb] = [nums(a.out.split('\n')[0]), nums(b.out.split('\n')[0])];
      expect(na).toHaveLength(nb.length);
      na.forEach((x, i) => expect(Math.abs(x - nb[i])).toBeLessThanOrEqual(1));
      expect(a.out.replace(/[\d.]+/g, '#')).toBe(b.out.replace(/[\d.]+/g, '#'));
    }, 60_000);

    it('grouped drawings keep the Android splash after the default fit (no transform on <g>)', async () => {
      await writeFile(join(dir, 'grp.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" stroke="#fff" stroke-width="4"><g><circle cx="40" cy="40" r="20"/><rect x="60" y="60" width="40" height="40"/></g></svg>');
      expect((await cli('from-svg', 'grp.svg', '--icon', 'app-icon', '-o', 'grp.designer.json')).code).toBe(0);
      expect(JSON.stringify(await doc('grp.designer.json'))).toMatch(/"type":"group"/);
      expect((await cli('to-svg', 'grp.designer.json', '--glyph')).out).not.toContain('transform');
      const r = await cli('icons', 'grp.designer.json', '-o', 'icons-grp');
      expect(r.code).toBe(0);
      expect(r.out).not.toContain('! android splash');
      expect(await readFile(join(dir, 'icons-grp/android/res/drawable/ic_splash.xml'), 'utf8')).toContain('<vector');
    }, 60_000);
  });
  it('icons --colour full / --glyph: colour modes stored in the project, overridden per run, validated', async () => {
    const colourDir = join(__dirname, '../icon/__tests__/fixtures/colour');
    const rainbow = readFileSync(join(colourDir, 'designer-rainbow.designer.json'), 'utf8');
    await writeFile(join(dir, 'rainbow.designer.json'), rainbow);
    const text = (f: string) => readFile(join(dir, f), 'utf8');
    // from-svg / new store the mode; the default (one colour, white) stores nothing
    const sync = readFileSync(join(__dirname, '../icon/__tests__/fixtures/glyph-sync.svg'), 'utf8');
    await writeFile(join(dir, 'sync3.svg'), sync);
    await cli('from-svg', 'sync3.svg', '-o', 'c-default.designer.json', '--icon', 'app-icon', '--no-fit');
    expect((await json('c-default.designer.json')).icon).toEqual({ preset: 'app-icon', shape: 'auto' });
    await cli('from-svg', 'sync3.svg', '-o', 'c-full.designer.json', '--icon', 'app-icon', '--no-fit', '--colour', 'full');
    expect((await json('c-full.designer.json')).icon).toEqual({ preset: 'app-icon', shape: 'auto', colour: 'full-colour' });
    await cli('new', '--preset', 'app-icon', '--tile', '#ffffff', '--glyph', '#FF0000', '-o', 'c-red.designer.json');
    expect((await json('c-red.designer.json')).icon).toEqual({ preset: 'app-icon', shape: 'auto', tile: '#ffffff', glyph: '#ff0000' });
    await cli('new', '--preset', 'app-icon', '--glyph', '#fff', '--colour', 'one', '-o', 'c-white.designer.json');
    expect((await json('c-white.designer.json')).icon).toEqual({ preset: 'app-icon', shape: 'auto' });
    // usage errors
    expect((await cli('new', '--preset', 'app-icon', '--glyph', '#ff0000', '--colour', 'full')).err).toMatch(/no effect with --colour full/);
    expect((await cli('new', '--preset', 'app-icon', '--colour', 'rainbow')).err).toMatch(/--colour must be one or full/);
    expect((await cli('new', '--preset', 'app-icon', '--glyph', '#ff00')).err).toMatch(/--glyph must be a hex colour/);
    expect((await cli('new', '--colour', 'full')).code).toBe(2); // not an icon preset

    // a full-colour project: the glyph keeps its paints, icons use them
    const g = await cli('to-svg', 'rainbow.designer.json', '--glyph');
    expect(g.out).toContain('url(#g1)');
    expect(g.out).not.toContain('currentColor');
    expect((await cli('to-svg', 'rainbow.designer.json', '--glyph', '--colour', 'one')).out).toContain('currentColor');
    expect((await cli('to-svg', 'c-default.designer.json', '--glyph', '--colour', 'full')).out).not.toContain('currentColor');
    expect((await cli('to-svg', 'rainbow.designer.json', '--colour', 'one')).code).toBe(2); // --colour only applies to --glyph
    const r = await cli('icons', 'rainbow.designer.json', '-o', 'icons-rainbow');
    expect(r.code).toBe(0);
    expect(await text('icons-rainbow/docs-img/icon.svg')).toContain('linearGradient');
    expect(await text('icons-rainbow/android/res/drawable/ic_splash.xml')).toContain('aapt:attr');
    expect(await text('icons-rainbow/glyph.svg')).toContain('stop-color="#ff3b30"');
    // --colour one overrides the project for one run (back to currentColor / white)
    await cli('icons', 'rainbow.designer.json', '-o', 'icons-rainbow-one', '--colour', 'one');
    expect(await text('icons-rainbow-one/docs-img/icon.svg')).not.toContain('linearGradient');
    expect(await text('icons-rainbow-one/docs-img/icon.svg')).toContain('fill="#fff"');
    // --glyph recolours a one-colour icon for a run; a stored glyph colour is used by default
    await cli('icons', 'c-default.designer.json', '-o', 'icons-g', '--tile', '#ffffff', '--glyph', '#ff0000');
    expect(await text('icons-g/docs-img/icon.svg')).toContain('fill="#ff0000"');
    const d0 = await json('c-default.designer.json');
    await writeFile(join(dir, 'c-red-glyph.designer.json'), JSON.stringify({ ...d0, icon: { ...d0.icon, tile: '#ffffff', glyph: '#ff0000' } }));
    expect((await cli('icons', 'c-red-glyph.designer.json', '-o', 'icons-red')).code).toBe(0);
    expect(await text('icons-red/docs-img/icon.svg')).toContain('fill="#ff0000"');
    expect((await cli('icons', 'rainbow.designer.json', '-o', 'icons-bad', '--glyph', '#ff0000')).err).toMatch(/no effect/);
    // contrast: a white glyph on a white tile warns (icons, validate, info)
    await cli('new', '--preset', 'app-icon', '--tile', '#ffffff', '-o', 'c-vanish.designer.json');
    const doc = await json('c-vanish.designer.json');
    await writeFile(join(dir, 'c-vanish.designer.json'), JSON.stringify({ ...doc, children: (await json('c-default.designer.json')).children }));
    const v = await cli('validate', 'c-vanish.designer.json');
    expect(v.out).toContain('icon colour: one colour: glyph #ffffff on tile #ffffff');
    expect(v.out).toMatch(/note: contrast: the glyph colour too close to the tile #ffffff/);
    const i = await cli('info', 'c-vanish.designer.json');
    expect(i.out).toContain('colour: one colour: glyph #ffffff on tile #ffffff');
    expect(i.out).toContain('note: contrast:');
    expect((await cli('info', 'rainbow.designer.json')).out).toContain('colour: full colour on tile #14141f');
    const ic = await cli('icons', 'c-vanish.designer.json', '-o', 'icons-vanish');
    expect(ic.out).toMatch(/! contrast: the glyph colour too close/);
  }, 180_000);
});
