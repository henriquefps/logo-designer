// @vitest-environment happy-dom
// `designer wf components import`, `designer wf kit` and `designer new --kit` (docs/wireframe-mode.md → Kits, import and paste).
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { serializeProject, validateDocument } from '@/io/projectFile';
import type { DesignDocument } from '@/model';
import { acmeKit, miniKit, screensDoc } from '@/wireframe/__tests__/fixtures/miniKit';
import { main } from './main';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'designer-kit-'));
  await writeFile(join(dir, 'kit.designer.json'), serializeProject(miniKit().doc));
  await writeFile(join(dir, 'app.designer.json'), serializeProject(screensDoc(['Trips'], [], 'App')));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

async function cli(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: dir });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const load = async (f: string): Promise<DesignDocument> => validateDocument(JSON.parse(await readFile(join(dir, f), 'utf8')), { warnings: [] });
const names = (d: DesignDocument) => (d.wireframe?.symbols ?? []).map((s) => s.name);

describe('designer wf components import', () => {
  it('copies the masters (nested ones too), reports in JSON, and a second run is a no-op', async () => {
    const r = await cli('wf', 'components', 'import', 'app.designer.json', '--from', 'kit.designer.json', '--json');
    expect(r.code).toBe(0);
    expect(r.err).toContain('Imported from kit.designer.json: 2 components added, 1 master link left out (no screen of that name)');
    const report = JSON.parse(r.out);
    expect(report.added.map((a: { name: string }) => a.name)).toEqual(['Trip card', 'Trip list']);
    expect(report).toMatchObject({ project: 'app.designer.json', reused: [], flows: 1, droppedFlows: 1 });
    const doc = await load('app.designer.json');
    expect(names(doc)).toEqual(['Trip card', 'Trip list']);
    const before = await readFile(join(dir, 'app.designer.json'), 'utf8');
    const again = await cli('wf', 'components', 'import', 'app.designer.json', '--from', 'kit.designer.json', '--json');
    expect(JSON.parse(again.out)).toMatchObject({ added: [], reused: [{ name: 'Trip card' }, { name: 'Trip list' }] });
    expect(await readFile(join(dir, 'app.designer.json'), 'utf8')).toBe(before);
  });

  it('--only picks components by name (their nested masters come along); -o writes elsewhere', async () => {
    await writeFile(join(dir, 'b.designer.json'), serializeProject(screensDoc(['Home'], [], 'B')));
    const r = await cli('wf', 'components', 'import', 'b.designer.json', '--from', 'kit.designer.json', '--only', 'Trip list', '-o', 'b2.designer.json');
    expect(r.code).toBe(0);
    expect(names(await load('b2.designer.json'))).toEqual(['Trip card', 'Trip list']);
    expect(names(await load('b.designer.json'))).toEqual([]);
    const bad = await cli('wf', 'components', 'import', 'b.designer.json', '--from', 'kit.designer.json', '--only', 'Nope');
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/no shared component “Nope” in kit.designer.json \(it has: “Trip card”, “Trip list”\)/);
  });

  it('imports from a bundled sample (sample:<id>) and checks its arguments', async () => {
    await writeFile(join(dir, 'c.designer.json'), serializeProject(screensDoc([], [], 'C')));
    const r = await cli('wf', 'components', 'import', 'c.designer.json', '--from', 'sample:roam');
    expect(r.code).toBe(0);
    expect(names(await load('c.designer.json'))).toEqual(['Tab bar']);
    expect((await cli('wf', 'components', 'import', 'c.designer.json', '--from', 'sample:nope')).err).toMatch(/Unknown sample "nope"/);
    expect((await cli('wf', 'components', 'import', 'c.designer.json')).code).toBe(2);
    expect((await cli('wf', 'components', 'import')).code).toBe(2);
    expect((await cli('wf', 'components', '--from', 'x')).code).toBe(2);
    expect((await cli('wf', 'help')).out).toContain('components import <project> --from');
  });
});

describe('designer wf kit', () => {
  it('marks a project as a component kit and --off unmarks it; the flag round-trips', async () => {
    await writeFile(join(dir, 'k.designer.json'), serializeProject(miniKit().doc));
    const on = await cli('wf', 'kit', 'k.designer.json');
    expect(on.code).toBe(0);
    expect(on.err).toContain('k.designer.json is now a component kit (2 shared components)');
    expect((await load('k.designer.json')).wireframe!.kit).toBe(true);
    const before = await readFile(join(dir, 'k.designer.json'), 'utf8');
    expect((await cli('wf', 'kit', 'k.designer.json')).err).toContain('is already a component kit');
    expect(await readFile(join(dir, 'k.designer.json'), 'utf8')).toBe(before);
    // wf build --into keeps it a kit (a project setting, not part of the spec).
    const spec = await cli('wf', 'dump', 'k.designer.json', '-o', 'k.spec.json');
    expect(spec.code).toBe(0);
    expect((await cli('wf', 'build', 'k.spec.json', '--into', 'k.designer.json')).code).toBe(0);
    expect((await load('k.designer.json')).wireframe!.kit).toBe(true);
    const off = await cli('wf', 'kit', 'k.designer.json', '--off', '-o', 'k-off.designer.json');
    expect(off.err).toContain('is no longer a component kit');
    expect((await load('k-off.designer.json')).wireframe!.kit).toBeUndefined();
    expect((await cli('wf', 'kit')).code).toBe(2);
    expect((await cli('wf', 'kit', 'k.designer.json', '--from', 'x')).code).toBe(2);
    expect((await cli('wf', 'components', '--off')).code).toBe(2);
  });

  it('ignores a kit flag that is not a boolean, with a warning', () => {
    const warnings: string[] = [];
    const doc = validateDocument({ schemaVersion: 1, artboard: { width: 1, height: 1 }, children: [], wireframe: { screens: [], kit: 'yes' } }, { warnings });
    expect(doc.wireframe!.kit).toBeUndefined();
    expect(warnings).toEqual(['wireframe.kit: ignored, expected true or false, got "yes"']);
    expect(validateDocument({ schemaVersion: 1, artboard: { width: 1, height: 1 }, children: [], wireframe: { screens: [], kit: false } }, { warnings: [] }).wireframe!.kit).toBeUndefined();
  });
});

describe('designer new --kit', () => {
  it('an empty wireframe with every shared component of a kit project, no screens; --json reports', async () => {
    await writeFile(join(dir, 'acme.designer.json'), serializeProject(acmeKit()));
    const r = await cli('new', '--kit', 'acme.designer.json', '-o', 'fromkit.designer.json', '--name', 'Mine', '--json');
    expect(r.code).toBe(0);
    const doc = await load('fromkit.designer.json');
    const kit = await load('acme.designer.json');
    expect(doc.name).toBe('Mine');
    expect(names(doc)).toEqual(['Acme · Trip card', 'Acme · Trip list']);
    expect(doc.wireframe!.screens).toEqual([]);
    expect(doc.children).toEqual([]);
    // The new project is not a kit itself.
    expect(doc.wireframe!.kit).toBeUndefined();
    // Fresh master ids, nested references pointing at them.
    const ids = new Set(doc.wireframe!.symbols!.map((s) => s.id));
    expect(kit.wireframe!.symbols!.some((s) => ids.has(s.id))).toBe(false);
    const refs = JSON.stringify(doc.wireframe!.symbols).match(/"symbol":\{"id":"([^"]+)"/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((m) => ids.has(m.slice(16, -1)))).toBe(true);
    // The kit's master flows target screens the new project lacks: left out.
    expect(JSON.parse(r.out)).toMatchObject({ project: 'fromkit.designer.json', kit: 'acme.designer.json', components: ['Acme · Trip card', 'Acme · Trip list'], droppedFlows: 2 });
    expect((await cli('new', '--preset', 'wireframe', '--kit', 'acme.designer.json')).code).toBe(0);
    // Importing the same kit into it again changes nothing (both reused, the nested one included).
    const again = await cli('wf', 'components', 'import', 'fromkit.designer.json', '--from', 'acme.designer.json', '--json');
    expect(JSON.parse(again.out)).toMatchObject({ added: [], flows: 0 });
    expect(JSON.parse(again.out).reused).toHaveLength(2);
  });

  it('rejects samples that are not kits, projects without shared components and other presets', async () => {
    const notKit = await cli('new', '--kit', 'sample:roam');
    expect(notKit.code).toBe(2);
    expect(notKit.err).toMatch(/Unknown component kit "roam" \(kits: none in this build\)/);
    await writeFile(join(dir, 'plain.designer.json'), serializeProject(screensDoc(['Home'], [], 'Plain')));
    const empty = await cli('new', '--kit', 'plain.designer.json');
    expect(empty.code).toBe(1);
    expect(empty.err).toMatch(/plain.designer.json has no shared components/);
    expect((await cli('new', '--kit', 'missing.designer.json')).code).toBe(2);
    expect((await cli('new', '--kit', 'acme.designer.json', '--preset', 'app-icon')).code).toBe(2);
    expect((await cli('new', '--kit', 'acme.designer.json', '--json')).code).toBe(2);
  });
});
