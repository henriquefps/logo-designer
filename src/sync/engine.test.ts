// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRect, type DesignDocument } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { startSync, useSyncStore } from './engine';
import { fakeSyncServer } from './__tests__/fakeServer';

const until = async (cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const server = fakeSyncServer();
let stop: () => void = () => {};

beforeAll(async () => {
  vi.stubGlobal('fetch', server.fetch);
  await useProjectsStore.getState().init();
  await useProjectsStore.getState().create('Shared');
  useSyncStore.getState().setSettings({ enabled: true, url: 'http://sync.test', apiKey: '', syncFonts: false });
  stop = startSync();
});
afterAll(() => {
  stop();
  vi.unstubAllGlobals();
});

describe('sync engine with the event stream', () => {
  it('subscribes, and a change made elsewhere lands in the open project within a moment', async () => {
    await until(() => useSyncStore.getState().stream === 'open');
    useDocStore.getState().addNodes([createRect()]);
    const id = useProjectsStore.getState().activeId!;
    // pushed after autosave + 2 s
    await until(() => (server.items.projects.get(id)?.data as DesignDocument | undefined)?.children.length === 1);
    const remote = structuredClone(server.items.projects.get(id)!.data) as DesignDocument;
    const at = Date.now() + 1;
    server.put('projects', id, {
      name: 'Shared (CLI)',
      createdAt: remote.createdAt,
      updatedAt: at,
      deleted: false,
      base: server.items.projects.get(id)!.updatedAt,
      data: { ...remote, name: 'Shared (CLI)', updatedAt: at, live: { editedBy: 'cli' } },
    });
    const t0 = Date.now();
    await until(() => useDocStore.getState().doc.name === 'Shared (CLI)', 2000);
    expect(Date.now() - t0).toBeLessThan(1000); // not the 30 s poll
    expect(useProjectsStore.getState().projects.find((p) => p.id === id)!.live).toBe('cli');
  });

  it('pushes a live project’s edits fast (≈ 500 ms, not 2.6 s)', async () => {
    const id = useProjectsStore.getState().activeId!;
    const before = server.items.projects.get(id)!.updatedAt;
    const t0 = Date.now();
    useDocStore.getState().addNodes([createRect()]);
    await until(() => server.items.projects.get(id)!.updatedAt > before, 2000);
    expect(Date.now() - t0).toBeLessThan(1200);
    expect((server.items.projects.get(id)!.data as DesignDocument).live!.editedBy).toMatch(/^app:/);
  });
});
