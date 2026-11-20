// @vitest-environment happy-dom
// `designer wf build | dump | components` (docs/agents.md → Wireframes from the CLI).
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from './main';

const EXAMPLE = readFileSync(resolve(__dirname, '../wireframe/spec/__tests__/hoard-settings.spec.json'), 'utf8');

let dir = '';
let stdin = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'designer-wf-'));
  await writeFile(join(dir, 'hoard.spec.json'), EXAMPLE);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

async function cli(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: dir, stdin: async () => stdin });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const json = async (f: string) => JSON.parse(await readFile(join(dir, f), 'utf8'));

describe('designer wf', () => {
  it('help: listed in the main usage, its own usage, unknown commands', async () => {
    expect((await cli('help')).out).toContain('wf build|dump|components');
    const h = await cli('wf', 'help');
    expect(h.code).toBe(0);
    expect(h.out).toContain('build <spec.json|-> [-o project.designer.json] [--into existing.designer.json]');
    expect((await cli('wf', 'build', '--help')).out).toContain('dump <project>');
    expect((await cli('wf')).code).toBe(1);
    expect((await cli('wf', 'frob')).code).toBe(2);
    expect((await cli('wf', 'build', 'a.json', '--bogus')).code).toBe(2);
  });

  it('build: spec → project file, with a summary; the project validates', async () => {
    const r = await cli('wf', 'build', 'hoard.spec.json', '-o', 'hoard.designer.json');
    expect(r.code).toBe(0);
    expect(r.err).toContain('Built: 2 screens (2 frames)');
    const doc = await json('hoard.designer.json');
    expect(doc.wireframe.screens.map((s: { name: string }) => s.name)).toEqual(['Settings', 'Server']);
    expect(doc.wireframe.flows).toHaveLength(2);
    expect((await cli('validate', 'hoard.designer.json')).out).toMatch(/^ok {3}hoard\.designer\.json: “Hoard”, wireframe, 2 screens \(2 frames\)/);
  });

  it('build: stdin in, stdout out', async () => {
    stdin = JSON.stringify({ screens: [{ name: 'Home', root: [{ heading: 'Hello' }] }] });
    const r = await cli('wf', 'build', '-');
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out);
    expect(doc.wireframe.screens[0].name).toBe('Home');
    expect(doc.children[0].children[0].component).toMatchObject({ kind: 'heading', props: { text: 'Hello' } });
  });

  it('build: errors name the spec path and exit 1', async () => {
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ screens: [{ name: 'A', root: [] }, { name: 'B', root: [{ heading: 'x' }, {}, {}, { 'list-row': { trailing: 'arrow' } }] }] }));
    const r = await cli('wf', 'build', 'bad.json', '-o', 'bad.designer.json');
    expect(r.code).toBe(1);
    expect(r.err).toContain('the spec has 3 problems');
    expect(r.err).toContain('screens[1].root[3].list-row.trailing: "arrow" is not one of none, chevron, toggle, value, checkbox');
    await writeFile(join(dir, 'broken.json'), '{ "screens": [');
    expect((await cli('wf', 'build', 'broken.json')).err).toMatch(/broken\.json: not valid JSON/);
  });

  it('dump: project → spec (stdout or -o), --no-geometry', async () => {
    await cli('wf', 'build', 'hoard.spec.json', '-o', 'dump-src.designer.json');
    const r = await cli('wf', 'dump', 'dump-src.designer.json');
    expect(r.code).toBe(0);
    const spec = JSON.parse(r.out);
    expect(Object.keys(spec)).toEqual(['$schema', 'version', 'name', 'components', 'screens', 'flows', 'notes']);
    expect(spec.screens[0]).toMatchObject({ name: 'Settings', status: 'changed', platform: 'phone', x: 0, y: 0 });
    expect(spec.screens[0].root[2]).toEqual({ 'list-row': { title: 'Server address', subtitle: 'hoard.hfps.dev' }, id: 'row-server' });
    expect((await cli('wf', 'dump', 'dump-src.designer.json', '-o', 'spec.json', '--no-geometry')).err).toContain('Wrote spec to spec.json');
    expect((await json('spec.json')).screens[0].x).toBeUndefined();
    await writeFile(join(dir, 'logo.designer.json'), JSON.stringify({ schemaVersion: 1, artboard: { width: 10, height: 10 }, children: [] }));
    expect((await cli('wf', 'dump', 'logo.designer.json')).err).toContain('is not a wireframe project');
  });

  it('build --into: edits the project in place by id', async () => {
    await cli('wf', 'build', 'hoard.spec.json', '-o', 'live.designer.json');
    await cli('wf', 'dump', 'live.designer.json', '-o', 'live.spec.json', '--no-geometry');
    const spec = await json('live.spec.json');
    spec.screens[0].root[2]['list-row'].subtitle = 'nas.local';
    spec.screens[0].root.splice(3, 1); // the Status row
    await writeFile(join(dir, 'live.spec.json'), JSON.stringify(spec));
    const before = await json('live.designer.json');
    const r = await cli('wf', 'build', 'live.spec.json', '--into', 'live.designer.json');
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/Updated live\.designer\.json: 2 screens \(2 frames\), \d+ nodes: 0 added, 1 removed, \d+ kept/);
    const after = await json('live.designer.json');
    expect(after.id).toBe(before.id);
    const settings = after.children.find((c: { name: string }) => c.name === 'Settings');
    expect(settings.children.find((c: { id: string }) => c.id === 'row-server').component.props.subtitle).toBe('nas.local');
    expect(settings.children).toHaveLength(before.children.find((c: { name: string }) => c.name === 'Settings').children.length - 1);
  });

  it('components: Markdown, JSON, filtered by kind', async () => {
    const md = await cli('wf', 'components');
    expect(md.code).toBe(0);
    expect(md.out).toContain('### List row — `list-row`');
    const one = await cli('wf', 'components', 'list-row', '--json');
    const cat = JSON.parse(one.out);
    expect(cat.components.map((c: { kind: string }) => c.kind)).toEqual(['list-row']);
    expect(cat.components[0].example).toEqual({ 'list-row': { title: 'Title', leading: 'none', trailing: 'chevron' } });
    expect((await cli('wf', 'components', 'nope')).code).toBe(1);
  });

  it('build: Lucide aliases draw their icon; an unknown icon name is a warning with suggestions', async () => {
    // Regression (phase 3 e2e run): "filter" (Lucide's old name for Funnel) silently drew a dashed placeholder,
    // in the CLI and in the app, because only the current names were looked up.
    const icons = (names: string[]) => ({ screens: [{ name: 'Icons', root: names.map((icon) => ({ icon: { icon } })) }] });
    await writeFile(join(dir, 'icons.json'), JSON.stringify(icons(['filter', 'check-circle', 'funnel', 'trash-2'])));
    const ok = await cli('wf', 'build', 'icons.json', '-o', 'icons.designer.json');
    expect(ok.code).toBe(0);
    expect(ok.err).not.toContain('warning');
    const placeholders = JSON.stringify(await json('icons.designer.json')).match(/"name":"icon\?:/g) ?? [];
    expect(placeholders).toHaveLength(0);

    await writeFile(join(dir, 'typo.json'), JSON.stringify(icons(['fliter', 'smartfone-x'])));
    const typo = await cli('wf', 'build', 'typo.json', '-o', 'typo.designer.json');
    expect(typo.code).toBe(0);
    expect(typo.err).toContain('warning: icon "fliter" is not a Lucide icon, so it is drawn as a placeholder (did you mean "filter"?)');
    expect(typo.err).toMatch(/warning: icon "smartfone-x" is not a Lucide icon, so it is drawn as a placeholder; names: https:\/\/lucide\.dev\/icons/);
  });
});

