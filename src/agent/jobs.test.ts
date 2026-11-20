import { describe, expect, it } from 'vitest';
import { createDocument } from '@/model';
import { addScreen } from '@/wireframe/screens';
import { applyJobEvent, availability, formatElapsed, jobRows, MAX_ROWS, presenceLabel, presenceOf, RECENT_MS, upsertJob, type Jobs } from './jobs';
import type { AgentInfo } from '@/sync/jobs';
import type { AppJob as Job } from './jobs';
import { restoredContent } from './snapshots';

const T = 1_700_000_000_000;
const job = (over: Partial<Job> = {}): Job => ({ id: 'j1', type: 'request', projectId: 'p1', input: { text: 'add an empty state' }, attachments: [], cancelRequested: false, status: 'queued', createdAt: T, updatedAt: T, ...over }) as Job;

describe('job state: server reads and events → rows', () => {
  it('takes the newer of the read log’s last line and the listing’s lastProgress', () => {
    const read = upsertJob({}, job({ status: 'running', updatedAt: T + 1, progress: [{ at: T + 1, message: 'Reading the project' }] }));
    const listed = upsertJob(read, { ...job({ status: 'running', updatedAt: T + 2 }), progressCount: 2, lastProgress: { at: T + 2, message: 'Round 1' } });
    expect(jobRows(listed, { projectId: 'p1', doc: null, now: T + 3 })[0].latest).toBe('Round 1');
  });

  it('upserts by updatedAt, and a metadata-only list keeps the progress already read', () => {
    let jobs: Jobs = {};
    jobs = upsertJob(jobs, job({ status: 'running', updatedAt: T + 10, progress: [{ at: T + 10, message: 'Reading the project' }] }));
    jobs = upsertJob(jobs, job({ status: 'running', updatedAt: T + 10 })); // the list (no progress)
    expect(jobs.j1.progress).toHaveLength(1);
    const older = upsertJob(jobs, job({ status: 'queued', updatedAt: T }));
    expect(older).toBe(jobs);
    expect(older.j1.status).toBe('running');
  });

  it('applies a jobs event at once and asks for the full read; stale events are ignored', () => {
    const jobs: Jobs = { j1: job({ updatedAt: T + 5 }) };
    const r = applyJobEvent(jobs, { kind: 'jobs', id: 'j1', status: 'running', updatedAt: T + 6 }, 'p1');
    expect(r.fetch).toBe(true);
    expect(r.jobs.j1.status).toBe('running');
    expect(applyJobEvent(r.jobs, { kind: 'jobs', id: 'j1', status: 'queued', updatedAt: T + 1 }, 'p1')).toEqual({ jobs: r.jobs, fetch: false });
    // An unknown job: read it when a project is open (it may be this project's, sent from another device).
    expect(applyJobEvent({}, { kind: 'jobs', id: 'x', status: 'queued', updatedAt: T }, 'p1').fetch).toBe(true);
    expect(applyJobEvent({}, { kind: 'jobs', id: 'x', status: 'queued', updatedAt: T }, null).fetch).toBe(false);
  });

  it('builds rows: this project only, running first, the latest progress, elapsed, cancel and undo', () => {
    const doc = createDocument({ name: 'App', wireframe: { screens: [] } });
    addScreen(doc, { platform: 'phone', name: 'Settings', x: 0, y: 0 });
    const settings = doc.wireframe!.screens[0].id;
    const jobs: Jobs = {
      a: job({ id: 'a', status: 'done', createdAt: T + 100, updatedAt: T + 400, startedAt: T + 110, finishedAt: T + 65_110, summary: 'Added an empty state to 3 screens.' }),
      b: job({
        id: 'b',
        type: 'next-screen',
        screenId: settings,
        input: { fromScreenId: 's0', fromNodeId: 'n', label: 'Settings', platform: 'phone', at: { x: 0, y: 0 } },
        status: 'running',
        createdAt: T,
        updatedAt: T + 50,
        startedAt: T + 10,
        progress: [
          { at: T + 20, message: 'Reading the project' },
          { at: T + 30, message: 'Round 1: building the list' },
        ],
      }),
      c: job({ id: 'c', projectId: 'other' }),
      d: job({ id: 'd', type: 'adapt', screenId: settings, input: { screenId: settings, fromPlatform: 'phone', toPlatform: 'tablet' }, status: 'failed', createdAt: T + 50, updatedAt: T + 60, error: 'agent went away' }),
    };
    const rows = jobRows(jobs, { projectId: 'p1', doc, now: T + 5_010, snapshots: new Set(['a', 'b']) });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'd']);
    const [b, a, d] = rows;
    expect(b).toMatchObject({ title: 'Next screen “Settings”', statusLabel: 'Working', latest: 'Round 1: building the list', elapsed: '5s', canCancel: true, canUndo: false, screen: 'Settings', summary: null });
    expect(a).toMatchObject({ title: 'Ask: “add an empty state”', status: 'done', elapsed: '1m 05s', summary: 'Added an empty state to 3 screens.', canCancel: false, canUndo: true });
    expect(d).toMatchObject({ title: 'Adapt “Settings” to tablet', error: 'agent went away', canUndo: false });
    // Cancel requested: the row says so and the button is gone until the bridge finishes it.
    const cancelling = jobRows({ b: { ...jobs.b, cancelRequested: true } }, { projectId: 'p1', doc, now: T });
    expect(cancelling[0]).toMatchObject({ statusLabel: 'Cancelling…', canCancel: false, cancelling: true });
    // Undone, dismissed, and old finished jobs.
    expect(jobRows(jobs, { projectId: 'p1', doc, now: T, snapshots: new Set(['a']), undone: new Set(['a']) }).find((r) => r.id === 'a')).toMatchObject({ canUndo: false, undone: true });
    expect(jobRows(jobs, { projectId: 'p1', doc, now: T, dismissed: new Set(['a', 'd']) }).map((r) => r.id)).toEqual(['b']);
    expect(jobRows(jobs, { projectId: 'p1', doc, now: T + 65_110 + RECENT_MS }).map((r) => r.id)).toEqual(['b']);
    expect(jobRows(jobs, { projectId: null, doc, now: T })).toEqual([]);
  });

  it('shows at most a few rows', () => {
    const many: Jobs = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`j${i}`, job({ id: `j${i}`, createdAt: T + i })]));
    const rows = jobRows(many, { projectId: 'p1', doc: null, now: T + 20 });
    expect(rows).toHaveLength(MAX_ROWS);
    expect(rows[0].id).toBe('j9');
  });

  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(59_999)).toBe('59s');
    expect(formatElapsed(61_000)).toBe('1m 01s');
    expect(formatElapsed(3_725_000)).toBe('1h 02m');
  });
});

describe('presence and entry-point preconditions', () => {
  const agent: AgentInfo = { agentId: 'a1', name: 'cachyos-fps', host: 'cachyos-fps', version: '0.3.0', busy: false, lastSeen: T };

  it('reads presence: no sync, older server, unreachable, offline, online, busy', () => {
    expect(presenceOf({ syncConfigured: false, agents: [agent], error: null })).toEqual({ kind: 'no-sync' });
    expect(presenceOf({ syncConfigured: true, agents: null, error: { kind: 'unsupported' } }).kind).toBe('unsupported');
    expect(presenceOf({ syncConfigured: true, agents: null, error: null }).kind).toBe('checking');
    expect(presenceOf({ syncConfigured: true, agents: [], error: null }).kind).toBe('offline');
    expect(presenceLabel(presenceOf({ syncConfigured: true, agents: [agent], error: null }))).toBe('Agent online on cachyos-fps');
    // An idle agent is preferred over a busy one.
    const busy = { ...agent, agentId: 'a0', name: 'mac', busy: true, jobId: 'j' };
    expect(presenceOf({ syncConfigured: true, agents: [busy, agent], error: null })).toMatchObject({ kind: 'online', agent: { agentId: 'a1' }, count: 2 });
    expect(presenceLabel(presenceOf({ syncConfigured: true, agents: [busy], error: null }))).toBe('Agent busy on mac');
  });

  it('enables the entry points only with an agent online, on a wireframe; the reason is the tooltip', () => {
    const online = presenceOf({ syncConfigured: true, agents: [agent], error: null });
    expect(availability(online, { wireframe: true })).toEqual({ ok: true });
    expect(availability(presenceOf({ syncConfigured: true, agents: [{ ...agent, busy: true }], error: null }), { wireframe: true })).toEqual({ ok: true }); // queued
    expect(availability(online, { wireframe: false })).toMatchObject({ ok: false });
    const why = (p: Parameters<typeof presenceOf>[0]) => {
      const a = availability(presenceOf(p), { wireframe: true });
      return a.ok ? '' : a.reason;
    };
    expect(why({ syncConfigured: false, agents: null, error: null })).toMatch(/Turn on Sync/);
    expect(why({ syncConfigured: true, agents: [], error: null })).toMatch(/No agent online.*designer agent/);
    expect(why({ syncConfigured: true, agents: null, error: { kind: 'unsupported' } })).toMatch(/update designer-sync/);
    expect(why({ syncConfigured: true, agents: null, error: { kind: 'unreachable', message: 'offline' } })).toMatch(/cannot be reached/);
  });
});

describe('snapshot restore', () => {
  it('takes the snapshot’s content and keeps the project’s identity and live mark', () => {
    const snap = createDocument({ name: 'Old name', wireframe: { screens: [] } });
    addScreen(snap, { platform: 'phone', name: 'Home', x: 0, y: 0 });
    const current = { ...structuredClone(snap), name: 'Renamed', updatedAt: snap.updatedAt + 1000, live: { editedBy: 'cli' } };
    addScreen(current, { platform: 'tablet', name: 'Agent made this', x: 600, y: 0 });
    (current as Record<string, unknown>).extra = 'added by the agent';
    const out = restoredContent(current, { ...snap, live: { editedBy: 'app:x' } });
    expect(out.wireframe!.screens.map((s) => s.name)).toEqual(['Home']);
    expect(out.children).toHaveLength(1);
    expect(out).not.toHaveProperty('extra');
    expect(out).toMatchObject({ id: current.id, name: 'Renamed', updatedAt: current.updatedAt, live: { editedBy: 'cli' } });
  });
});
