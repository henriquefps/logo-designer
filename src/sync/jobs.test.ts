import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncError } from './api';
import { subscribeEvents } from './events';
import { attachmentBytes, attachmentFromBytes, cancelJob, claimJob, createJob, finishJob, getAttachment, isActive, isFinished, listAgents, listJobs, newJobId, parseAgentsEvent, parseJobEvent, reportProgress, sendHeartbeat, serverHasJobs } from './jobs';

const conn = { url: 'http://192.168.1.10:3051/', apiKey: ' k ' };
const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }));
const call = (f: ReturnType<typeof vi.fn>, n = 0) => f.mock.calls[n] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe('jobs client requests', () => {
  it('creates a job with the key, JSON and the ids as given', async () => {
    const f = respond(201, { id: 'job-1', status: 'queued' });
    vi.stubGlobal('fetch', f);
    await createJob(conn, { id: 'job-1', type: 'request', projectId: 'p', input: { text: 'hi' } });
    const [url, init] = call(f);
    expect(url).toBe('http://192.168.1.10:3051/api/jobs');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ id: 'job-1', type: 'request', projectId: 'p', input: { text: 'hi' } });
  });

  it('builds the listing query and encodes ids in paths', async () => {
    const f = respond(200, { items: [] });
    vi.stubGlobal('fetch', f);
    await listJobs(conn);
    await listJobs(conn, { active: true, projectId: 'p 1' });
    await getAttachmentSafe(f);
    expect(call(f, 0)[0]).toBe('http://192.168.1.10:3051/api/jobs');
    expect(call(f, 1)[0]).toBe('http://192.168.1.10:3051/api/jobs?active=1&projectId=p+1');
    expect(call(f, 2)[0]).toBe('http://192.168.1.10:3051/api/jobs/a%20b/attachments/c%20d.png');
  });

  it('a lost claim (409) is null, other failures throw', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'the job is running, not queued' }));
    expect(await claimJob(conn, 'j', 'a')).toBeNull();
    vi.stubGlobal('fetch', respond(401, { error: 'x' }));
    await expect(claimJob(conn, 'j', 'a')).rejects.toMatchObject({ kind: 'auth', status: 401 });
    vi.stubGlobal('fetch', respond(404, { error: 'Not found.' }));
    await expect(claimJob(conn, 'j', 'a')).rejects.toMatchObject({ status: 404 });
    const f = respond(200, { id: 'j', status: 'running' });
    vi.stubGlobal('fetch', f);
    expect((await claimJob(conn, 'j', 'agent-1'))?.status).toBe('running');
    expect(JSON.parse(String(call(f)[1].body))).toEqual({ agentId: 'agent-1' });
  });

  it('keeps the server message and status on refusals', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'the job is done, not running' }));
    const e = await reportProgress(conn, 'j', { agentId: 'a', message: 'm' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SyncError);
    expect(e).toMatchObject({ message: 'the job is done, not running', kind: 'rejected', status: 409 });
    vi.stubGlobal('fetch', respond(413, { error: 'too big' }));
    await expect(createJob(conn, { id: 'x', type: 'request', projectId: 'p', input: { text: 't' } })).rejects.toMatchObject({ status: 413, message: 'too big' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fail'))));
    await expect(listAgents(conn)).rejects.toMatchObject({ kind: 'offline' });
  });

  it('progress, finish, cancel, heartbeat, agents and health', async () => {
    const f = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/agents') ? { items: [{ agentId: 'a' }] } : url.endsWith('/health') ? { ok: true, jobs: true } : { ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', f);
    await reportProgress(conn, 'j', { agentId: 'a', message: 'm', stage: 's' });
    await finishJob(conn, 'j', { agentId: 'a', status: 'done', summary: 'ok' });
    await cancelJob(conn, 'j');
    await sendHeartbeat(conn, { agentId: 'a', name: 'n', host: 'h', version: '1', busy: false });
    expect(await listAgents(conn)).toEqual([{ agentId: 'a' }]);
    expect(await serverHasJobs(conn)).toBe(true);
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([u, i]) => `${i.method} ${u.replace('http://192.168.1.10:3051', '')}`)).toEqual([
      'POST /api/jobs/j/progress',
      'POST /api/jobs/j/finish',
      'POST /api/jobs/j/cancel',
      'POST /api/agents/heartbeat',
      'GET /api/agents',
      'GET /api/health',
    ]);
  });

  it('a server without jobs says so', async () => {
    vi.stubGlobal('fetch', respond(200, { ok: true, projectCount: 0, fontCount: 0 }));
    expect(await serverHasJobs(conn)).toBe(false);
  });

  it('downloads an attachment as bytes with its mime type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } })));
    const a = await getAttachment(conn, 'j', 'shot.png');
    expect([...a.bytes]).toEqual([1, 2, 3]);
    expect(a.mime).toBe('image/png');
  });
});

async function getAttachmentSafe(f: ReturnType<typeof vi.fn>) {
  f.mockImplementationOnce(async () => new Response('x', { status: 200 }));
  await getAttachment(conn, 'a b', 'c d.png').catch(() => undefined);
}

describe('jobs helpers', () => {
  it('round-trips attachment bytes', () => {
    const bytes = new Uint8Array([0, 255, 128, 7]);
    const a = attachmentFromBytes('a.png', 'image/png', bytes);
    expect(a).toMatchObject({ name: 'a.png', mime: 'image/png' });
    expect([...attachmentBytes(a)]).toEqual([0, 255, 128, 7]);
    // A view into a bigger buffer only carries its own bytes.
    const big = new Uint8Array([9, 9, 1, 2, 9]);
    expect([...attachmentBytes(attachmentFromBytes('b', 'image/png', big.subarray(2, 4)))]).toEqual([1, 2]);
  });

  it('makes ids the server accepts', () => {
    const id = newJobId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
    expect(newJobId()).not.toBe(id);
  });

  it('knows active and finished statuses', () => {
    expect(['queued', 'running'].map((s) => isActive(s as 'queued'))).toEqual([true, true]);
    expect(['done', 'failed', 'cancelled'].map((s) => isFinished(s as 'done'))).toEqual([true, true, true]);
  });
});

describe('job and agent events', () => {
  it('parses job events and rejects others', () => {
    expect(parseJobEvent('{"kind":"jobs","id":"j","updatedAt":5,"status":"running"}')).toEqual({ kind: 'jobs', id: 'j', updatedAt: 5, status: 'running' });
    expect(parseJobEvent('{"kind":"jobs","id":"j","updatedAt":5,"status":"weird"}')).toBeNull();
    expect(parseJobEvent('{"kind":"projects","id":"j","updatedAt":5}')).toBeNull();
    expect(parseJobEvent('{nope')).toBeNull();
  });

  it('parses agent events', () => {
    expect(parseAgentsEvent('{"kind":"agents","id":"a","updatedAt":5,"status":"busy"}')).toEqual({ kind: 'agents', id: 'a', updatedAt: 5, status: 'busy' });
    expect(parseAgentsEvent('{"kind":"agents","id":"a","updatedAt":5}')).toBeNull();
    expect(parseAgentsEvent('{"kind":"jobs","id":"a","updatedAt":5,"status":"queued"}')).toBeNull();
  });

  it('subscribeEvents hands job and agent events to their own callbacks, not onChange', async () => {
    const sse =
      'retry: 3000\nevent: ready\ndata: {"serverTime":1}\n\n' +
      'event: change\ndata: {"kind":"jobs","id":"j1","status":"queued","updatedAt":2}\n\n' +
      'event: change\ndata: {"kind":"agents","id":"a1","status":"online","updatedAt":3}\n\n' +
      'event: change\ndata: {"kind":"projects","id":"p1","updatedAt":4}\n\n';
    const doFetch = vi.fn(async () => new Response(sse, { status: 200 })) as unknown as typeof fetch;
    const seen = { jobs: [] as unknown[], agents: [] as unknown[], changes: [] as unknown[] };
    const stop = subscribeEvents(conn, {
      fetch: doFetch,
      onChange: (e) => seen.changes.push(e),
      onJob: (e) => seen.jobs.push(e),
      onAgents: (e) => seen.agents.push(e),
    });
    await vi.waitFor(() => expect(seen.changes).toHaveLength(1));
    stop();
    expect(seen.jobs).toEqual([{ kind: 'jobs', id: 'j1', status: 'queued', updatedAt: 2 }]);
    expect(seen.agents).toEqual([{ kind: 'agents', id: 'a1', status: 'online', updatedAt: 3 }]);
    expect(seen.changes).toEqual([{ kind: 'projects', id: 'p1', updatedAt: 4 }]);
  });
});
