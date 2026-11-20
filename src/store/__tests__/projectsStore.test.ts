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

describe('canvas input gate (first click on a freshly loaded page)', () => {
  it('refuses canvas input until the saved project has been loaded', async () => {
    const { acceptsCanvasInput } = await import('@/canvas/inputGate');
    useProjectsStore.setState({ ready: false });
    expect(acceptsCanvasInput()).toBe(false);
    await p().init();
    expect(acceptsCanvasInput()).toBe(true);
  });
});

describe('live editing (sync)', () => {
  it('a pulled version replaces the open project in place without being saved again (no push back)', async () => {
    await p().init();
    const id = await p().create('Remote');
    await wait(AUTOSAVE_DELAY + 50);
    const before = p().saveState;
    const incoming = { ...useDocStore.getState().doc, name: 'From the CLI', updatedAt: 1_000_000, children: [createRect()] };
    expect(await p().applyRemote(incoming)).toBe(true);
    expect(useDocStore.getState().doc.name).toBe('From the CLI');
    expect(p().saveState).toBe(before); // no autosave scheduled
    await wait(AUTOSAVE_DELAY + 100);
    expect((await loadDocument(id))!.updatedAt).toBe(1_000_000);
  });

  it('keeps the selection on nodes that survive a pull', async () => {
    await p().init();
    await p().create('Sel');
    const [a, b] = [createRect(), createRect()];
    useDocStore.getState().addNodes([a, b]);
    await p().flush();
    const { useEditorStore } = await import('../useEditorStore');
    useEditorStore.getState().setSelection([a.id, b.id]);
    const doc = useDocStore.getState().doc;
    await p().applyRemote({ ...doc, updatedAt: doc.updatedAt + 1, children: doc.children.filter((c) => c.id !== b.id) });
    expect(useEditorStore.getState().selection).toEqual([a.id]);
  });

  it('a live project autosaves faster, records this device as the editor, and can stop being live', async () => {
    const { LIVE_AUTOSAVE_DELAY } = await import('@/sync/live');
    const { deviceId } = await import('@/sync/state');
    await p().init();
    const id = await p().create('Live');
    const doc = useDocStore.getState().doc;
    await p().applyRemote({ ...doc, live: { editedBy: 'cli' }, updatedAt: doc.updatedAt + 1 });
    expect(p().projects.find((m) => m.id === id)!.live).toBe('cli');

    useDocStore.getState().addNodes([createRect()]);
    await wait(LIVE_AUTOSAVE_DELAY + 80);
    expect(LIVE_AUTOSAVE_DELAY).toBeLessThan(AUTOSAVE_DELAY);
    expect(p().saveState).toBe('saved');
    expect((await loadDocument(id))!.live).toEqual({ editedBy: `app:${deviceId()}` });
    expect(p().projects.find((m) => m.id === id)!.live).toBe(`app:${deviceId()}`);

    p().stopLive();
    await wait(AUTOSAVE_DELAY + 100);
    expect((await loadDocument(id))!.live).toBeUndefined();
    expect(p().projects.find((m) => m.id === id)!.live).toBeUndefined();
  });
});
