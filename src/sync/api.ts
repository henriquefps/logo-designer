// HTTP client for the self-hosted sync server (see sync-server/). The server is a dumb, schema-less
// store of `{name, createdAt, updatedAt, deleted, data}` per id, last-write-wins; all the merging
// decisions are made here (plan.ts).

export type Kind = 'projects' | 'fonts';

export interface ServerMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  size: number;
}

export interface ServerRecord extends ServerMeta {
  data?: unknown;
}

export interface PutBody {
  name: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  /** The updatedAt this device last synced for the id (the server keeps the version it overwrites when it differs). */
  base?: number;
  data?: unknown;
}

export interface Connection {
  url: string;
  apiKey?: string;
}

export class SyncError extends Error {
  readonly kind: 'offline' | 'auth' | 'server' | 'rejected';
  constructor(message: string, kind: 'offline' | 'auth' | 'server' | 'rejected') {
    super(message);
    this.kind = kind;
  }
}

export const normalizeServerUrl = (url: string): string => url.trim().replace(/\/+$/, '');

async function request<T>(conn: Connection, method: string, path: string, body?: unknown): Promise<T> {
  const base = normalizeServerUrl(conn.url);
  if (!base) throw new SyncError('No sync server address configured.', 'rejected');
  const headers: Record<string, string> = {};
  if (conn.apiKey?.trim()) headers.Authorization = `Bearer ${conn.apiKey.trim()}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    // The browser hides why a request failed. An HTTPS page calling plain HTTP is the most common cause.
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http://')) {
      throw new SyncError(
        'Blocked: this page is HTTPS but the sync server address is plain HTTP (browsers refuse that, "mixed content"). ' +
          'Give the server an HTTPS address (Cloudflare Tunnel or Tailscale Serve), or open the app over plain HTTP.',
        'rejected',
      );
    }
    throw new SyncError('Could not reach the sync server. Is it running, and is this device online?', 'offline');
  }
  if (res.status === 401) throw new SyncError('The sync server rejected the request: missing or wrong API key.', 'auth');
  if (res.status === 413) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
    throw new SyncError(msg ?? 'This item is larger than the sync server accepts.', 'rejected');
  }
  if (res.status === 404 && method === 'GET') throw new SyncError('Not found on the server.', 'server');
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
    throw new SyncError(msg ?? `The sync server answered HTTP ${res.status}.`, res.status >= 500 ? 'server' : 'rejected');
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new SyncError('The sync server returned an unexpected response. Is this the Designer sync server?', 'server');
  }
}

export async function listItems(conn: Connection, kind: Kind): Promise<ServerMeta[]> {
  const data = await request<{ items?: ServerMeta[] }>(conn, 'GET', `/api/${kind}`);
  if (!Array.isArray(data.items)) throw new SyncError('The sync server returned an unexpected response. Is this the Designer sync server?', 'server');
  return data.items;
}

export const getItem = (conn: Connection, kind: Kind, id: string) =>
  request<ServerRecord>(conn, 'GET', `/api/${kind}/${encodeURIComponent(id)}`);

export const putItem = (conn: Connection, kind: Kind, id: string, body: PutBody) =>
  request<{ applied: boolean; item: ServerMeta }>(conn, 'PUT', `/api/${kind}/${encodeURIComponent(id)}`, body);

export const health = (conn: Connection) =>
  request<{ ok: boolean; projectCount: number; fontCount: number }>(conn, 'GET', '/api/health');
