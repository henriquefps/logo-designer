// An in-memory stand-in for designer-sync (sync-server/) for unit tests: the same routes, last-write-wins
// on PUT, and the /api/events stream. The real server has its own Go tests and the e2e script
// (scripts/live-e2e.ts) runs against it. Jobs and agent presence follow the phase 4 protocol
// (docs/wireframe-mode.md → Phase 4 → Protocol) for the app's and the bridge's tests.
import type { ServerMeta, ServerRecord } from '../api';

export interface FakeJob {
  id: string;
  type: string;
  projectId: string;
  screenId?: string;
  frameId?: string;
  input: unknown;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  agentId?: string;
  cancelRequested: boolean;
  summary?: string;
  error?: string;
  progress: { at: number; message: string; stage?: string }[];
  attachments: { name: string; mime: string; dataBase64: string }[];
}

export interface FakeAgent {
  agentId: string;
  name: string;
  host: string;
  version?: string;
  busy: boolean;
  jobId?: string;
  lastSeen: number;
}

interface Stored extends ServerRecord {
  data?: unknown;
}

export function fakeSyncServer(opts: { events?: boolean; apiKey?: string; jobs?: boolean } = {}) {
  const items = { projects: new Map<string, Stored>(), fonts: new Map<string, Stored>() };
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();
  const archived: Stored[] = [];
  let eventRequests = 0;
  const jobs = new Map<string, FakeJob>();
  const agents = new Map<string, FakeAgent>();

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const meta = (r: Stored): ServerMeta => ({ id: r.id, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted, size: r.size });

  function publish(kind: string, id: string, updatedAt: number, extra: Record<string, unknown> = {}) {
    const chunk = enc.encode(`event: change\ndata: ${JSON.stringify({ kind, id, updatedAt, ...extra })}\n\n`);
    for (const c of streams) {
      try {
        c.enqueue(chunk);
      } catch {
        streams.delete(c);
      }
    }
  }

  /** Same rule as store.go Put. */
  function put(kind: 'projects' | 'fonts', id: string, body: { name: string; createdAt: number; updatedAt: number; deleted: boolean; base?: number; data?: unknown }) {
    const cur = items[kind].get(id);
    if (cur && !(body.updatedAt > cur.updatedAt)) return { applied: false, item: meta(cur) };
    if (cur && !cur.deleted && kind === 'projects' && body.base !== cur.updatedAt) archived.push(structuredClone(cur));
    const data = body.deleted ? undefined : body.data;
    const rec: Stored = {
      id,
      name: body.name,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      deleted: body.deleted,
      size: data === undefined ? 0 : JSON.stringify(data).length,
      data: structuredClone(data),
    };
    items[kind].set(id, rec);
    publish(kind, id, rec.updatedAt);
    return { applied: true, item: meta(rec) };
  }

  // ---------- jobs and presence ----------

  const base = (j: FakeJob) => {
    const { progress: _p, attachments, ...rest } = j;
    void _p;
    return { ...rest, attachments: attachments.map((a) => ({ name: a.name, mime: a.mime, size: Math.floor((a.dataBase64.length * 3) / 4) })) };
  };
  /** Listings (like jobs.go): no progress log, its size and last line instead. */
  const jobMeta = (j: FakeJob) => ({ ...base(j), progressCount: j.progress.length, ...(j.progress.length ? { lastProgress: j.progress[j.progress.length - 1] } : {}) });
  const jobFull = (j: FakeJob) => ({ ...base(j), progress: structuredClone(j.progress) });
  const touch = (j: FakeJob) => {
    j.updatedAt = Math.max(Date.now(), j.updatedAt + 1);
    publish('jobs', j.id, j.updatedAt, { status: j.status });
  };
  const liveAgents = () => [...agents.values()].filter((a) => Date.now() - a.lastSeen < 45_000);
  const agentStatus = (a: FakeAgent | undefined) => (!a ? 'offline' : a.busy ? 'busy' : 'online');

  function createJob(body: Partial<FakeJob>): { status: number; body: unknown } {
    if (!body.id || !body.type || !body.projectId) return { status: 400, body: { error: 'id, type and projectId are required.' } };
    if (jobs.has(body.id)) return { status: 409, body: { error: 'A job with this id exists.' } };
    const now = Date.now();
    const j: FakeJob = {
      id: body.id,
      type: body.type,
      projectId: body.projectId,
      ...(body.screenId ? { screenId: body.screenId } : {}),
      ...(body.frameId ? { frameId: body.frameId } : {}),
      input: body.input ?? {},
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      cancelRequested: false,
      progress: [],
      attachments: body.attachments ?? [],
    };
    jobs.set(j.id, j);
    publish('jobs', j.id, j.updatedAt, { status: j.status });
    return { status: 201, body: jobFull(j) };
  }

  function claim(id: string, agentId: string): boolean {
    const j = jobs.get(id);
    if (!j || j.status !== 'queued') return false;
    j.status = 'running';
    j.agentId = agentId;
    j.startedAt = Date.now();
    touch(j);
    return true;
  }

  function progress(id: string, message: string, stage?: string) {
    const j = jobs.get(id);
    if (!j) return;
    j.progress.push({ at: Date.now(), message, ...(stage ? { stage } : {}) });
    if (j.progress.length > 200) j.progress.splice(0, j.progress.length - 200);
    touch(j);
  }

  function finish(id: string, status: 'done' | 'failed' | 'cancelled', opts: { summary?: string; error?: string } = {}) {
    const j = jobs.get(id);
    if (!j) return;
    j.status = status;
    j.finishedAt = Date.now();
    if (opts.summary) j.summary = opts.summary;
    if (opts.error) j.error = opts.error;
    touch(j);
  }

  function cancel(id: string) {
    const j = jobs.get(id);
    if (!j) return false;
    if (j.status === 'queued') {
      j.status = 'cancelled';
      j.finishedAt = Date.now();
    } else if (j.status === 'running') j.cancelRequested = true;
    touch(j);
    return true;
  }

  function heartbeat(a: Omit<FakeAgent, 'lastSeen'>) {
    const was = agents.get(a.agentId);
    const now: FakeAgent = { ...a, lastSeen: Date.now() };
    agents.set(a.agentId, now);
    if (agentStatus(was) !== agentStatus(now)) publish('agents', a.agentId, Date.now(), { status: agentStatus(now) });
  }

  /** The agent stops heartbeating (the server drops it after 45 s; here at once). */
  function goAway(agentId: string) {
    if (agents.delete(agentId)) publish('agents', agentId, Date.now(), { status: 'offline' });
  }

  async function jobsRoute(method: string, url: URL, parts: string[], body: unknown): Promise<Response | null> {
    if (opts.jobs === false) return json(404, { error: 'Not found.' }); // a server before 0.3.0
    if (parts[1] === 'agents') {
      if (parts[2] === 'heartbeat' && method === 'POST') {
        heartbeat(body as Omit<FakeAgent, 'lastSeen'>);
        return json(200, { ok: true });
      }
      if (!parts[2] && method === 'GET') return json(200, { items: liveAgents() });
      return json(404, { error: 'Not found.' });
    }
    if (parts[1] !== 'jobs') return null;
    const id = parts[2] ? decodeURIComponent(parts[2]) : undefined;
    if (!id && method === 'POST') {
      const r = createJob(body as Partial<FakeJob>);
      return json(r.status, r.body);
    }
    if (!id && method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const active = url.searchParams.get('active') === '1';
      const list = [...jobs.values()]
        .filter((j) => (projectId ? j.projectId === projectId : true) && (active ? j.status === 'queued' || j.status === 'running' : true))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(jobMeta);
      return json(200, { items: list });
    }
    const j = id ? jobs.get(id) : undefined;
    if (!j) return json(404, { error: 'Not found.' });
    const action = parts[3];
    if (!action && method === 'GET') return json(200, jobFull(j));
    if (action === 'attachments' && method === 'GET') {
      const a = j.attachments.find((x) => x.name === decodeURIComponent(parts[4] ?? ''));
      if (!a) return json(404, { error: 'Not found.' });
      const bin = atob(a.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { status: 200, headers: { 'Content-Type': a.mime } });
    }
    const b = (body ?? {}) as { agentId?: string; message?: string; stage?: string; status?: 'done' | 'failed' | 'cancelled'; summary?: string; error?: string };
    if (action === 'claim' && method === 'POST') return claim(j.id, b.agentId ?? '') ? json(200, jobFull(j)) : json(409, { error: 'Already claimed.' });
    if (action === 'progress' && method === 'POST') {
      progress(j.id, b.message ?? '', b.stage);
      return json(200, { status: j.status, cancelRequested: j.cancelRequested, progressCount: j.progress.length });
    }
    if (action === 'finish' && method === 'POST') {
      finish(j.id, b.status ?? 'done', b);
      return json(200, jobFull(j));
    }
    if (action === 'cancel' && method === 'POST') {
      cancel(j.id);
      return json(200, jobFull(j));
    }
    return json(404, { error: 'Not found.' });
  }

  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? 'GET';
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    const parts = url.pathname.split('/').filter(Boolean); // api, kind, id
    if (parts[1] === 'events') eventRequests++;
    if (opts.apiKey && auth !== `Bearer ${opts.apiKey}`) return json(401, { error: 'Missing or invalid API key.' });
    if (parts[1] === 'events' && method === 'GET') {
      if (opts.events === false) return json(404, { error: 'Not found.' });
      let ctrl!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c;
          streams.add(c);
          c.enqueue(enc.encode(`retry: 3000\nevent: ready\ndata: {"serverTime":${Date.now()}}\n\n`));
        },
        cancel() {
          streams.delete(ctrl);
        },
      });
      init.signal?.addEventListener('abort', () => {
        streams.delete(ctrl);
        try {
          ctrl.error(new DOMException('aborted', 'AbortError'));
        } catch {
          // already closed
        }
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (parts[1] === 'health' && method === 'GET') return json(200, { ok: true, projectCount: items.projects.size, fontCount: items.fonts.size, events: opts.events !== false, ...(opts.jobs === false ? {} : { jobs: true }) });
    if (parts[1] === 'jobs' || parts[1] === 'agents') {
      const r = await jobsRoute(method, url, parts, init.body ? JSON.parse(String(init.body)) : undefined);
      if (r) return r;
    }
    const kind = parts[1] as 'projects' | 'fonts';
    if (kind !== 'projects' && kind !== 'fonts') return json(404, { error: 'Not found.' });
    const id = parts[2] ? decodeURIComponent(parts[2]) : undefined;
    if (!id && method === 'GET') return json(200, { items: [...items[kind].values()].map(meta), serverTime: Date.now() });
    if (id && method === 'GET') {
      const r = items[kind].get(id);
      return r ? json(200, r) : json(404, { error: 'Not found.' });
    }
    if (id && method === 'PUT') return json(200, put(kind, id, JSON.parse(String(init.body))));
    return json(404, { error: 'Not found.' });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    items,
    archived,
    put,
    jobs,
    agents,
    claim,
    progress,
    finish,
    cancel,
    heartbeat,
    goAway,
    /** Ends every open stream (a dropped connection). */
    dropStreams() {
      for (const c of streams) {
        try {
          c.close();
        } catch {
          // ignore
        }
      }
      streams.clear();
    },
    get openStreams() {
      return streams.size;
    },
    get eventRequests() {
      return eventRequests;
    },
  };
}
