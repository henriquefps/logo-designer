// An in-memory stand-in for designer-sync (sync-server/) for unit tests: the same routes, last-write-wins
// on PUT, and the /api/events stream. The real server has its own Go tests and the e2e script
// (scripts/live-e2e.ts) runs against it.
import type { ServerMeta, ServerRecord } from '../api';

interface Stored extends ServerRecord {
  data?: unknown;
}

export function fakeSyncServer(opts: { events?: boolean; apiKey?: string } = {}) {
  const items = { projects: new Map<string, Stored>(), fonts: new Map<string, Stored>() };
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();
  const archived: Stored[] = [];
  let eventRequests = 0;

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const meta = (r: Stored): ServerMeta => ({ id: r.id, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted, size: r.size });

  function publish(kind: string, id: string, updatedAt: number) {
    const chunk = enc.encode(`event: change\ndata: ${JSON.stringify({ kind, id, updatedAt })}\n\n`);
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
