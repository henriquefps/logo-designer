// @vitest-environment happy-dom
// `designer wf components import` and `designer new --kit` (docs/wireframe-mode.md → Kits, import and paste).
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { serializeProject, validateDocument } from '@/io/projectFile';
import type { DesignDocument } from '@/model';
import { miniKit, screensDoc } from '@/wireframe/__tests__/fixtures/miniKit';
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
    const r = await cli('wf', 'components', 'import', 'c.designer.json', '--from', 'sample:hfps-kit', '--only', 'hfps · Primary button,hfps · Top bar');
    expect(r.code).toBe(0);
    expect(names(await load('c.designer.json'))).toEqual(expect.arrayContaining(['hfps · Primary button', 'hfps · Top bar']));
    expect((await cli('wf', 'components', 'import', 'c.designer.json', '--from', 'sample:nope')).err).toMatch(/Unknown sample "nope"/);
    expect((await cli('wf', 'components', 'import', 'c.designer.json')).code).toBe(2);
    expect((await cli('wf', 'components', 'import')).code).toBe(2);
    expect((await cli('wf', 'components', '--from', 'x')).code).toBe(2);
    expect((await cli('wf', 'help')).out).toContain('components import <project> --from');
  });
});

describe('designer new --kit', () => {
  it('an empty wireframe with every shared component of the kit, no screens; --json reports', async () => {
    const r = await cli('new', '--kit', 'hfps-kit', '-o', 'fromkit.designer.json', '--name', 'Mine', '--json');
    expect(r.code).toBe(0);
    const doc = await load('fromkit.designer.json');
    const kit = validateDocument(JSON.parse(await readFile(join(__dirname, '../../public/samples/hfps-kit.designer.json'), 'utf8')), { warnings: [] });
    expect(doc.name).toBe('Mine');
    expect(names(doc)).toEqual(names(kit));
    expect(doc.wireframe!.screens).toEqual([]);
    expect(doc.children).toEqual([]);
    // Fresh master ids, nested references pointing at them.
    const ids = new Set(doc.wireframe!.symbols!.map((s) => s.id));
    expect(kit.wireframe!.symbols!.some((s) => ids.has(s.id))).toBe(false);
    expect(JSON.stringify(doc.wireframe!.symbols).match(/"symbol":\{"id":"([^"]+)"/g)?.every((m) => ids.has(m.slice(16, -1))) ?? true).toBe(true);
    expect(JSON.parse(r.out)).toMatchObject({ project: 'fromkit.designer.json', kit: 'hfps-kit', droppedFlows: 0 });
    expect((await cli('new', '--preset', 'wireframe', '--kit', 'hfps-kit')).code).toBe(0);
    // Importing the same kit into it again changes nothing (all 36 reused, nested ones included).
    const again = await cli('wf', 'components', 'import', 'fromkit.designer.json', '--from', 'sample:hfps-kit', '--json');
    expect(JSON.parse(again.out)).toMatchObject({ added: [], flows: 0 });
    expect(JSON.parse(again.out).reused).toHaveLength(names(kit).length);
  });

  it('rejects samples that are not kits and other presets', async () => {
    const notKit = await cli('new', '--kit', 'roam');
    expect(notKit.code).toBe(2);
    expect(notKit.err).toMatch(/Unknown component kit "roam" \(kits: hfps-kit\)/);
    expect((await cli('new', '--kit', 'hfps-kit', '--preset', 'app-icon')).code).toBe(2);
    expect((await cli('new', '--kit', 'hfps-kit', '--json')).code).toBe(2);
  });
});
