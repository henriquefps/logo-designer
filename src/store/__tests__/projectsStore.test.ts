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

describe('opening a live project', () => {
  it('does not autosave it (opening is not an edit)', async () => {
    await p().init();
    const id = await p().create('Was live');
    const doc = useDocStore.getState().doc;
    await p().applyRemote({ ...doc, live: { editedBy: 'cli' }, updatedAt: 2_000_000 });
    await p().create('Other');
    await p().open(id);
    expect(p().saveState).not.toBe('pending');
    await wait(AUTOSAVE_DELAY + 100);
    expect((await loadDocument(id))!.updatedAt).toBe(2_000_000);
    expect((await loadDocument(id))!.live).toEqual({ editedBy: 'cli' });
  });

  it('an autosave pending on the project being closed is not saved into the live project opened next', async () => {
    // Regression (phase 3 e2e run): the app was open on another project with an autosave pending when
    // `?open-project=` switched to the live project; the sync engine's flush() then saved the live project as
    // "edited in the app", with a newer timestamp, and that empty copy replaced the agent's `wf build --into`.
    await p().init();
    const liveId = await p().create('Agent project');
    const doc = useDocStore.getState().doc;
    await p().applyRemote({ ...doc, live: { editedBy: 'cli' }, updatedAt: 3_000_000 });
    const otherId = await p().create('Other');
    const r = createRect();
    useDocStore.getState().addNodes([r]); // an edit, autosave pending
    expect(p().saveState).toBe('pending');
    await p().open(liveId); // open() flushes; also cover a change that lands while it loads:
    expect(useDocStore.getState().doc.id).toBe(liveId);
    await p().flush(); // what the sync engine does before every sync
    await wait(AUTOSAVE_DELAY + 100);
    expect((await loadDocument(liveId))!.updatedAt).toBe(3_000_000);
    expect((await loadDocument(liveId))!.live).toEqual({ editedBy: 'cli' });
    expect((await loadDocument(otherId))!.children.map((c) => c.id)).toEqual([r.id]); // its edit was kept
  });

  it('…also when the pending autosave starts while the live project is loading', async () => {
    await p().init();
    const liveId = await p().create('Agent project 2');
    const doc = useDocStore.getState().doc;
    await p().applyRemote({ ...doc, live: { editedBy: 'cli' }, updatedAt: 4_000_000 });
    const otherId = await p().create('Other 2');
    const opening = p().open(liveId); // flush() has run, loadDocument() is in flight…
    const r = createRect();
    useDocStore.getState().addNodes([r]); // …when the old project changes (a load, icons filled in, an edit)
    await opening;
    expect(useDocStore.getState().doc.id).toBe(liveId);
    await p().flush();
    await wait(AUTOSAVE_DELAY + 100);
    expect((await loadDocument(liveId))!.updatedAt).toBe(4_000_000);
    expect((await loadDocument(otherId))!.children.map((c) => c.id)).toEqual([r.id]);
  });
});
