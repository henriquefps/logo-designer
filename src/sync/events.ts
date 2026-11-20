// Client for the sync server's live event stream (`GET /api/events`, Server-Sent Events). Used by the app
// and by the CLI (`designer live`), so it runs on plain `fetch` (EventSource cannot send the Authorization
// header). The stream is only a hint that something changed: on every (re)connect the caller runs its
// normal sync to catch up with what it missed.
import { normalizeServerUrl, type Connection, type Kind } from './api';
import { parseAgentsEvent, parseJobEvent, type AgentsEvent, type JobEvent } from './jobs';

export interface ChangeEvent {
  kind: Kind;
  id: string;
  updatedAt: number;
}

/** connecting → open; `unsupported` = an older server without the stream (the caller keeps polling). */
export type StreamState = 'connecting' | 'open' | 'unsupported' | 'auth' | 'closed';

/** Pure SSE parser: feed it text chunks as they arrive; it calls `onEvent(name, data)` per complete event. */
export function createSseParser(onEvent: (name: string, data: string) => void, onActivity?: () => void) {
  let buf = '';
  let name = '';
  let data: string[] = [];
  return (chunk: string) => {
    buf += chunk;
    onActivity?.();
    let nl: number;
    while ((nl = buf.search(/\r\n|\n|\r/)) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + (buf.startsWith('\r\n', nl) ? 2 : 1));
      if (line === '') {
        if (data.length) onEvent(name || 'message', data.join('\n'));
        name = '';
        data = [];
        continue;
      }
      if (line.startsWith(':')) continue; // comment: the heartbeat
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') name = value;
      else if (field === 'data') data.push(value);
    }
  };
}

export function parseChange(data: string): ChangeEvent | null {
  try {
    const v = JSON.parse(data) as Partial<ChangeEvent>;
    if ((v.kind === 'projects' || v.kind === 'fonts') && typeof v.id === 'string' && typeof v.updatedAt === 'number') {
      return { kind: v.kind, id: v.id, updatedAt: v.updatedAt };
    }
  } catch {
    // ignore a malformed event
  }
  return null;
}

export interface SubscribeOptions {
  onChange: (e: ChangeEvent) => void;
  /** A job was created, claimed, progressed or finished (phase 4, agent jobs). */
  onJob?: (e: JobEvent) => void;
  /** An agent came online, went busy or idle, or went offline. */
  onAgents?: (e: AgentsEvent) => void;
  /** The stream is (re)connected: catch up with a normal sync. */
  onOpen?: () => void;
  onState?: (s: StreamState) => void;
  fetch?: typeof fetch;
  /** No byte for this long (the server sends a heartbeat every 25 s) = a dead connection: reconnect. */
  idleTimeoutMs?: number;
}

const RETRY_MIN = 1_000;
const RETRY_MAX = 30_000;
/** An older server (404) or a refused key: try again now and then, the user may update the server or the key. */
const RETRY_SLOW = 5 * 60_000;

/** Opens the stream and keeps it open (reconnecting with backoff) until the returned function is called. */
export function subscribeEvents(conn: Connection, opts: SubscribeOptions): () => void {
  const doFetch = opts.fetch ?? fetch;
  const idleMs = opts.idleTimeoutMs ?? 60_000;
  let stopped = false;
  let ctrl: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const setState = (s: StreamState) => opts.onState?.(s);
  const schedule = (ms: number) => {
    if (stopped) return;
    retryTimer = setTimeout(() => void connect(), ms);
  };

  async function connect() {
    if (stopped) return;
    setState('connecting');
    ctrl = new AbortController();
    const c = ctrl;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => c.abort(), idleMs);
    };
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (conn.apiKey?.trim()) headers.Authorization = `Bearer ${conn.apiKey.trim()}`;
      bump();
      const res = await doFetch(`${normalizeServerUrl(conn.url)}/api/events`, { headers, signal: c.signal, cache: 'no-store' });
      if (res.status === 404 || res.status === 405) {
        setState('unsupported');
        return schedule(RETRY_SLOW);
      }
      if (res.status === 401) {
        setState('auth');
        return schedule(RETRY_SLOW);
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const parse = createSseParser((name, data) => {
        if (name === 'ready') {
          failures = 0;
          setState('open');
          opts.onOpen?.();
        } else if (name === 'change') {
          const e = parseChange(data);
          if (e) return opts.onChange(e);
          const j = opts.onJob && parseJobEvent(data);
          if (j) return opts.onJob?.(j);
          const a = opts.onAgents && parseAgentsEvent(data);
          if (a) opts.onAgents?.(a);
        }
      }, bump);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(decoder.decode(value, { stream: true }));
      }
    } catch {
      // network error, abort (idle or stop): handled below
    } finally {
      if (idle) clearTimeout(idle);
    }
    if (stopped) return;
    failures++;
    setState('connecting');
    schedule(Math.min(RETRY_MIN * 2 ** (failures - 1), RETRY_MAX));
  }

  void connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    ctrl?.abort();
    setState('closed');
  };
}
