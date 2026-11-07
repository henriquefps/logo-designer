import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRect } from '@/model';
import { loadDocument, loadProjectList } from '../persistence';
import { AUTOSAVE_DELAY, useProjectsStore } from '../useProjectsStore';
import { useDocStore } from '../useDocStore';

const p = () => useProjectsStore.getState();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useProjectsStore', () => {
  it('creates a first project, autosaves, and manages projects', async () => {
    await p().init();
    expect(p().ready).toBe(true);
    expect(p().projects).toHaveLength(1);
    const firstId = p().activeId!;

    const r = createRect();
    useDocStore.getState().addNodes([r]);
    expect(p().saveState).toBe('pending');
    await wait(AUTOSAVE_DELAY + 100);
    expect((await loadDocument(firstId))!.children.map((c) => c.id)).toEqual([r.id]);

    await p().rename(firstId, 'Logo');
    expect(useDocStore.getState().doc.name).toBe('Logo');
    expect((await loadProjectList()).find((m) => m.id === firstId)!.name).toBe('Logo');

    const copyId = (await p().duplicate(firstId))!;
    expect((await loadDocument(copyId))!.name).toBe('Logo copy');
    expect(p().activeId).toBe(firstId);

    const secondId = await p().create('Banner');
    expect(p().activeId).toBe(secondId);
    expect(useDocStore.getState().doc.children).toHaveLength(0);

    await p().open(firstId);
    expect(useDocStore.getState().doc.children).toHaveLength(1);

    await p().remove(firstId);
    expect(p().projects.map((m) => m.id)).not.toContain(firstId);
    expect(p().activeId).not.toBe(firstId);
    expect(await loadDocument(firstId)).toBeNull();
  });
});
