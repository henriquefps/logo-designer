// The app side of component kits (docs/wireframe-mode.md → Kits, import and paste): which local projects are
// offered as kits, the kit toggle, New document from a kit project, and the import toast's count.
// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { symbolsOf } from '../symbols';
import { planSymbolImport } from '../symbolImport';
import { componentSources, importSummary, setKitCommand, sourceKey } from '../symbolImportCommands';
import { createWireframeDocument } from '../commands';
import { acmeKit, miniKit, screensDoc } from './fixtures/miniKit';

const projects = () => useProjectsStore.getState();

describe('component kit projects', () => {
  beforeEach(async () => {
    await projects().init();
    for (const p of [...projects().projects]) await projects().remove(p.id);
  });

  it('lists kits first (projects marked as kits), then other projects with shared components; plain ones never', async () => {
    const withComponents = miniKit().doc;
    withComponents.name = 'Has components';
    await projects().importDocument(withComponents);
    await projects().importDocument(screensDoc(['Home'], [], 'Plain'));
    await projects().importDocument(acmeKit());
    await projects().importDocument(screensDoc(['Other'], [], 'Open one'));
    const all = await componentSources();
    expect(all.map((r) => [r.name, r.kit])).toEqual([
      ['Acme kit', true],
      ['Has components', false],
    ]);
    expect((await componentSources({ kitsOnly: true })).map((r) => r.name)).toEqual(['Acme kit']);
  });

  it('the toggle marks the open project (one undo step); it is then offered, and New document starts from it', async () => {
    const id = await projects().importDocument(miniKit().doc);
    expect(useDocStore.getState().doc.wireframe!.kit).toBeUndefined();
    setKitCommand(true);
    expect(useDocStore.getState().doc.wireframe!.kit).toBe(true);
    // The open project counts with its unsaved state.
    const kits = await componentSources({ kitsOnly: true });
    expect(kits.map(sourceKey)).toEqual([`project:${id}`]);
    // Import lists everything but the open project.
    expect(await componentSources({ excludeActive: true })).toEqual([]);
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.wireframe!.kit).toBeUndefined();
    useDocStore.getState().redo();

    await createWireframeDocument({ name: 'From kit', kit: `project:${id}` });
    const doc = useDocStore.getState().doc;
    expect(doc.id).not.toBe(id);
    expect(doc.name).toBe('From kit');
    expect(symbolsOf(doc).map((s) => s.name)).toEqual(['Trip card', 'Trip list']);
    expect(doc.wireframe!.kit).toBeUndefined();
    await expect(createWireframeDocument({ kit: 'project:nope' })).rejects.toThrow(/Could not read the component kit/);
  });
});

describe('the import toast', () => {
  it('counts what the button counted: the ticked components plus the ones they nest', () => {
    const { doc, list } = miniKit();
    // Only "Trip list" ticked: its nested "Trip card" comes along, so the button said "Import 2 (1 comes along)".
    const plan = planSymbolImport(screensDoc(['Trips']), doc, { ids: [list] });
    expect(importSummary(plan, 1)).toEqual({ title: 'Imported 2 components', description: '1 came along because others use it; 1 link left out: no screen of that name here.' });
    // Into a project that already has both: nothing new, the same total.
    const target = screensDoc(['Trips']);
    target.wireframe!.symbols = structuredClone(doc.wireframe!.symbols);
    expect(importSummary(planSymbolImport(target, doc, { ids: [list] }), 1)).toEqual({ title: 'Nothing new to import', description: 'All 2 are already in this project.' });
  });
});
