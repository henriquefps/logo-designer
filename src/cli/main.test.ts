// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
    await cli('from-svg', 'sync.svg', '-o', 'sync.designer.json', '--icon', 'app-icon');
    const r = await cli('icons', 'sync.designer.json', '-o', 'icons');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^shape tall: glyph 48% x 68% of the tile, ink (10\.9|11\.0|11\.1)%$/m);
    expect(r.out).toContain('android: glyph half-diagonal 29.9dp <= 33dp safe zone');
    for (const f of ['glyph.svg', 'docs-img/icon.svg', 'site/favicon.ico', 'android/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 'ios/AppIcon.appiconset/Contents.json', 'review-sheet.png', 'README.txt', 'sync.designer.json'])
      expect((await readFile(join(dir, 'icons', f))).length).toBeGreaterThan(0);
    // The glyph is byte-identical to `to-svg --glyph`.
    expect(await readFile(join(dir, 'icons/glyph.svg'), 'utf8')).toBe((await cli('to-svg', 'sync.designer.json', '--glyph')).out + '\n');
    expect((await cli('icons', 'sync.designer.json')).code).toBe(2);
  }, 60_000);

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
});
