// @vitest-environment happy-dom
// The app's side of phase 4 against the in-memory sync server: presence from heartbeats, the entry points' jobs
// (flushed + live first, a snapshot taken), progress and finish events into rows, cancel, and the undo.
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGroup, isScreenNode, type ComponentNode, type DesignDocument, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { startSync, useSyncStore } from '@/sync/engine';
import { fakeSyncServer } from '@/sync/__tests__/fakeServer';
import { createWireframeDocument } from '@/wireframe/commands';
import { addScreen, frames } from '@/wireframe/screens';
import { currentPresence, refreshAgents, startAgent, undoAgentChanges, requestCancel, useAgentStore } from './agentStore';
import { sendAdapt, sendNextScreen, sendRequest, sendScreenshot } from './commands';
import { jobRows } from './jobs';
import { canSendNow } from './send';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
// happy-dom has no image decoding: the screenshot is read as is.
vi.mock('@/io/importActions', async (orig) => ({
  ...(await orig<typeof import('@/io/importActions')>()),
  imageFileToDataUrl: async (f: Blob) => ({ href: `data:image/png;base64,${btoa(await f.text())}`, width: 390, height: 844 }),
}));

const until = async (what: string, cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

const server = fakeSyncServer();
const AGENT = { agentId: 'bridge-1', name: 'cachyos-fps', host: 'cachyos-fps', version: '0.3.0', busy: false };
const stops: (() => void)[] = [];
const rows = () => jobRows(useAgentStore.getState().jobs, { projectId: useProjectsStore.getState().activeId, doc: useDocStore.getState().doc, now: Date.now(), snapshots: useAgentStore.getState().snapshots, undone: useAgentStore.getState().undone });
const serverDoc = (id: string) => server.items.projects.get(id)?.data as DesignDocument | undefined;

beforeAll(async () => {
  vi.stubGlobal('fetch', server.fetch);
  await useProjectsStore.getState().init();
  await createWireframeDocument();
  // A button on the first screen: the source of the "Generate with AI" flow.
  useDocStore.getState().apply((d) => {
    const f = d.children.find(isScreenNode) as ScreenNode;
    f.name = 'Home';
    d.wireframe!.screens[0].name = 'Home';
    f.children.push({ ...createGroup({ name: 'Settings button' }), id: 'btn', component: { kind: 'button', props: { label: 'Settings' } } } as ComponentNode);
  });
  await useProjectsStore.getState().flush();
});
afterAll(() => {
  for (const s of stops) s();
  vi.unstubAllGlobals();
});

describe('agent in the app', () => {
  it('cannot send without sync, then without an agent online', async () => {
    stops.push(startAgent());
    expect(currentPresence().kind).toBe('no-sync');
    expect(canSendNow()).toMatchObject({ ok: false, reason: expect.stringMatching(/Turn on Sync/) });
    expect(await sendRequest('hello')).toBeNull();
    useSyncStore.getState().setSettings({ enabled: true, url: 'http://sync.test', apiKey: '', syncFonts: false });
    stops.push(startSync());
    await until('presence read', () => currentPresence().kind === 'offline');
    expect(canSendNow()).toMatchObject({ ok: false, reason: expect.stringMatching(/No agent online/) });
    expect(server.jobs.size).toBe(0);
  });

  it('sees an agent come online from its heartbeat (agents event)', async () => {
    await until('stream open', () => useSyncStore.getState().stream === 'open');
    server.heartbeat(AGENT);
    await until('agent online', () => currentPresence().kind === 'online');
    expect(canSendNow()).toEqual({ ok: true });
  });

  it('Ask the agent: flushes the project to the server marked live, snapshots it, creates the job', async () => {
    const pid = useProjectsStore.getState().activeId!;
    const job = await sendRequest('  add an empty state to every list  ');
    expect(job).not.toBeNull();
    const stored = server.jobs.get(job!.id)!;
    expect(stored).toMatchObject({ type: 'request', projectId: pid, input: { text: 'add an empty state to every list' }, status: 'queued' });
    expect(serverDoc(pid)?.live?.editedBy).toMatch(/^app:/);
    expect(useDocStore.getState().doc.live).toBeTruthy();
    expect(useAgentStore.getState().snapshots.has(job!.id)).toBe(true);
    expect(rows()[0]).toMatchObject({ id: job!.id, status: 'queued', canCancel: true });
  });

  it('turns claim, progress and finish events into the row: status, latest line, summary, undo', async () => {
    const id = [...server.jobs.keys()][0];
    server.claim(id, AGENT.agentId);
    server.heartbeat({ ...AGENT, busy: true, jobId: id });
    server.progress(id, 'Reading the project');
    server.progress(id, 'Round 1: adding empty states', 'build');
    await until('progress in the row', () => rows()[0]?.latest === 'Round 1: adding empty states');
    expect(rows()[0]).toMatchObject({ status: 'running', statusLabel: 'Working', canUndo: false });
    await until('busy', () => currentPresence().kind === 'busy');

    // The agent changes the project (as `designer live` would): a new screen arrives through sync.
    const pid = useProjectsStore.getState().activeId!;
    const remote = structuredClone(serverDoc(pid)!);
    addScreen(remote, { platform: 'phone', name: 'Empty state', x: 600, y: 0 });
    remote.updatedAt = Date.now() + 5;
    remote.live = { editedBy: 'cli' };
    server.put('projects', pid, { name: remote.name, createdAt: remote.createdAt, updatedAt: remote.updatedAt, deleted: false, base: serverDoc(pid)!.updatedAt, data: remote });
    await until('agent edit in the app', () => useDocStore.getState().doc.wireframe!.screens.some((s) => s.name === 'Empty state'));

    server.finish(id, 'done', { summary: 'Added an empty state screen.' });
    await until('done row', () => rows()[0]?.status === 'done');
    expect(rows()[0]).toMatchObject({ summary: 'Added an empty state screen.', canUndo: true, canCancel: false });

    // Undo the agent's changes: back to the snapshot, as one undoable edit that is synced.
    expect(await undoAgentChanges(id)).toBe(true);
    expect(useDocStore.getState().doc.wireframe!.screens.map((s) => s.name)).toEqual(['Home']);
    expect(rows()[0]).toMatchObject({ undone: true, canUndo: false });
    await until('undo reached the server', () => !serverDoc(pid)!.wireframe!.screens.some((s) => s.name === 'Empty state'));
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.wireframe!.screens.some((s) => s.name === 'Empty state')).toBe(true);
    useDocStore.getState().redo();
  });

  it('Generate with AI: makes the empty target screen, links it, then sends next-screen', async () => {
    const before = frames(useDocStore.getState().doc).length;
    const home = frames(useDocStore.getState().doc)[0];
    const job = await sendNextScreen({ fromId: 'btn', point: { x: 900, y: 40 }, screen: { x: 0, y: 0 } }, { hint: 'a list of toggles' });
    expect(job).not.toBeNull();
    const doc = useDocStore.getState().doc;
    const made = frames(doc).find((f) => f.id === job!.frameId)!;
    expect(frames(doc)).toHaveLength(before + 1);
    expect(made.name).toBe('Settings');
    expect(made.children).toHaveLength(0);
    expect(doc.wireframe!.flows).toContainEqual(expect.objectContaining({ from: 'btn', to: made.screen.screenId }));
    expect(server.jobs.get(job!.id)).toMatchObject({
      type: 'next-screen',
      screenId: made.screen.screenId,
      frameId: made.id,
      input: { fromScreenId: home.screen.screenId, fromNodeId: 'btn', label: 'Settings', platform: 'phone', hint: 'a list of toggles', at: { x: 900, y: 40 } },
    });
    // The server has the new screen before the agent starts.
    expect(serverDoc(doc.id)!.children.some((n) => n.id === made.id)).toBe(true);
  });

  it('Adapt with AI and the screenshot job carry their inputs; a screenshot goes as an attachment', async () => {
    const home = frames(useDocStore.getState().doc)[0];
    const adapt = await sendAdapt(home.id, 'tablet', { hint: ' two panes ' });
    expect(server.jobs.get(adapt!.id)).toMatchObject({ type: 'adapt', screenId: home.screen.screenId, frameId: home.id, input: { screenId: home.screen.screenId, fromPlatform: 'phone', toPlatform: 'tablet', hint: 'two panes' } });
    const shot = await sendScreenshot(new File(['PNGDATA'], 'shot.png', { type: 'image/png' }), { platform: 'phone', name: 'Gallery', hint: '' });
    const stored = server.jobs.get(shot!.id)!;
    expect(stored).toMatchObject({ type: 'screenshot', input: { platform: 'phone', name: 'Gallery' } });
    expect(stored.input).not.toHaveProperty('hint');
    expect(stored.attachments).toEqual([{ name: 'screenshot.png', mime: 'image/png', dataBase64: btoa('PNGDATA') }]);
  });

  it('cancels: a queued job at once, a running one once the bridge finishes it', async () => {
    const queued = [...server.jobs.values()].find((j) => j.type === 'adapt')!;
    await requestCancel(queued.id);
    await until('queued cancelled', () => rows().find((r) => r.id === queued.id)?.status === 'cancelled');

    const running = [...server.jobs.values()].find((j) => j.type === 'screenshot')!;
    server.claim(running.id, AGENT.agentId);
    await until('running', () => rows().find((r) => r.id === running.id)?.status === 'running');
    await requestCancel(running.id);
    expect(server.jobs.get(running.id)!.cancelRequested).toBe(true);
    await until('cancelling', () => rows().find((r) => r.id === running.id)?.cancelling === true);
    server.finish(running.id, 'cancelled');
    await until('cancelled', () => rows().find((r) => r.id === running.id)?.status === 'cancelled');
  });

  it('goes offline when the agent stops heartbeating', async () => {
    server.goAway(AGENT.agentId);
    await until('offline', () => currentPresence().kind === 'offline');
    expect(canSendNow().ok).toBe(false);
  });
});

describe('an older sync server', () => {
  it('says the server has no agent jobs', async () => {
    const old = fakeSyncServer({ jobs: false });
    vi.stubGlobal('fetch', old.fetch);
    await refreshAgents();
    expect(currentPresence().kind).toBe('unsupported');
    expect(canSendNow()).toMatchObject({ ok: false, reason: expect.stringMatching(/update designer-sync/) });
    vi.stubGlobal('fetch', server.fetch);
  });
});
