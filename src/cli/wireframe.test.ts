// @vitest-environment happy-dom
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { expandGlobs } from './globPlugin';
import { main } from './main';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'designer-wf-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

async function cli(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: dir });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const json = async (f: string) => JSON.parse(await readFile(join(dir, f), 'utf8'));
const pngSize = (path: string) => {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

describe('designer CLI: wireframes', () => {
  it('new --preset wireframe, screen, variants, validate, info', async () => {
    expect((await cli('new', '--preset', 'wireframe', '--name', 'Notes', '-o', 'w.designer.json')).code).toBe(0);
    expect(await json('w.designer.json')).toMatchObject({ name: 'Notes', wireframe: { screens: [] }, children: [] });
    expect((await cli('screen', 'w.designer.json', '--name', 'Home')).err).toMatch(/added screen “Home” \(phone\)/);
    expect((await cli('screen', 'w.designer.json', '--name', 'Settings', '--platform', 'desktop')).code).toBe(0);
    const variant = await cli('screen', 'w.designer.json', '--name', 'settings', '--platform', 'phone');
    expect(variant.err).toMatch(/added the phone variant of “Settings” \(a copy of its desktop frame\)/);
    const again = await cli('screen', 'w.designer.json', '--name', 'Settings', '--platform', 'phone');
    expect(again.code).toBe(1);
    expect(again.err).toMatch(/already has a phone frame/);
    expect((await cli('screen', 'w.designer.json', '--platform', 'watch')).err).toMatch(/--platform must be one of phone, tablet, desktop/);
    const doc = await json('w.designer.json');
    expect(doc.wireframe.screens.map((s: { name: string }) => s.name)).toEqual(['Home', 'Settings']);
    expect(doc.children.map((c: { screen: { platform: string; width: number; height: number } }) => c.screen)).toEqual([
      expect.objectContaining({ platform: 'phone', width: 390, height: 844 }),
      expect.objectContaining({ platform: 'desktop', width: 1440, height: 900 }),
      expect.objectContaining({ platform: 'phone', width: 390, height: 844 }),
    ]);
    const v = await cli('validate', 'w.designer.json');
    expect(v.code).toBe(0);
    expect(v.out).toMatch(/ok {3}w\.designer\.json: “Notes”, wireframe, 2 screens \(3 frames\)/);
    expect(v.out).toMatch(/Settings: desktop 1440×900 \[[^\]]+\], phone 390×844/);
    expect((await cli('info', 'w.designer.json')).out).toMatch(/group “Home” screen phone 390×844, 0 children/);
    expect((await cli('screen', 'w.designer.json', '--name', 'X', '-o', 'copy.designer.json')).code).toBe(0);
    expect((await json('copy.designer.json')).wireframe.screens).toHaveLength(3);
  });

  it('validate brings screen heights up to date and warns about unknown components', async () => {
    const doc = await json('w.designer.json');
    doc.children[0].children = [
      { type: 'group', component: { kind: 'placeholder', props: { label: 'Feed', height: 1200 } }, transform: { x: 24, y: 100 }, children: [] },
      { type: 'group', component: { kind: 'from-the-future', props: {} }, children: [] },
    ];
    await writeFile(join(dir, 'grown.designer.json'), JSON.stringify(doc));
    const v = await cli('validate', 'grown.designer.json');
    expect(v.code).toBe(0);
    // The screen's content is a vertical stack: padding 16 + 1200 + gap 12 + (the unknown kind, an empty group) + 16.
    expect(v.out).toMatch(/Home: phone 390×1244/);
    expect(v.out).toMatch(/warning: children\[0\]\.children\[1\]\.component\.kind: unknown component "from-the-future"/);
  });

  it('to-png: one PNG per frame into a folder, or one file; to-svg --screen', async () => {
    const all = await cli('to-png', 'w.designer.json');
    expect(all.code).toBe(0);
    for (const f of ['home.phone.png', 'settings.desktop.png', 'settings.phone.png']) expect(existsSync(join(dir, 'w-screens', f))).toBe(true);
    expect(pngSize(join(dir, 'w-screens', 'settings.desktop.png'))).toEqual({ width: 1440, height: 900 });
    expect((await cli('to-png', 'w.designer.json', '--screen', 'Home', '--size', '780', '-o', 'home.png')).code).toBe(0);
    expect(pngSize(join(dir, 'home.png'))).toEqual({ width: 780, height: 1688 });
    expect((await cli('to-png', 'w.designer.json', '--screen', 'Nope')).err).toMatch(/no screen “Nope”/);
    const svg = await cli('to-svg', 'w.designer.json', '--screen', 'Home');
    expect(svg.out).toMatch(/viewBox="0 0 390 844"/);
    expect((await cli('to-svg', 'w.designer.json', '--screen', 'Settings')).err).toMatch(/2 frames match; add --platform/);
  });

  it('export-ai writes the package as a zip or into a folder', async () => {
    const zipRun = await cli('export-ai', 'w.designer.json', '-o', 'pkg.zip');
    expect(zipRun.code).toBe(0);
    const zip = await JSZip.loadAsync(readFileSync(join(dir, 'pkg.zip')));
    const names = Object.keys(zip.files).filter((p) => !p.endsWith('/'));
    expect(names).toContain('notes/README.md');
    expect(names).toContain('notes/project.designer.json');
    expect(names.some((p) => /^notes\/screens\/.+\.md$/.test(p))).toBe(true);
    expect(names.some((p) => /^notes\/screens\/home\.phone\.png$/.test(p))).toBe(true);
    expect((await cli('export-ai', 'w.designer.json', '--dir', 'pkgdir')).err).toMatch(/Wrote \d+ files to pkgdir/);
    expect(readFileSync(join(dir, 'pkgdir/README.md'), 'utf8')).toMatch(/^# /);
    expect(readFileSync(join(dir, 'pkgdir/screens/home.phone.png')).subarray(1, 4).toString()).toBe('PNG');
    expect((await cli('export-ai', 'w.designer.json', '-o', 'a.zip', '--dir', 'b')).code).toBe(2);
  });

  it('the bin expands import.meta.glob under Bun (registries work in the CLI)', () => {
    const root = resolve(__dirname, '../..');
    const out = execFileSync('bun', [join(root, 'bin/designer.ts'), 'validate', join(dir, 'grown.designer.json')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // The placeholder kind is known (from the glob-discovered library), so it is not reported as unknown.
    expect(out).not.toMatch(/unknown component "placeholder"/);
    expect(out).toMatch(/Home: phone 390×1244/);
  });
});

describe('expandGlobs', () => {
  it('rewrites the eager form into static imports', () => {
    const src = "const m = import.meta.glob<{ default: X }>('./*/index.{ts,tsx}', { eager: true });\nexport default m;";
    const out = expandGlobs(src, '/x', (pattern, cwd) => (pattern === '*/index.{ts,tsx}' && cwd === '/x' ? ['b/index.ts', 'a/index.tsx'] : []));
    expect(out).toContain('import * as __glob_0 from "./a/index.tsx";');
    expect(out).toContain('import * as __glob_1 from "./b/index.ts";');
    expect(out).toContain('const m = ({ "./a/index.tsx": __glob_0, "./b/index.ts": __glob_1 });');
    expect(expandGlobs('no globs here', '/x', () => [])).toBe('no globs here');
  });
});
