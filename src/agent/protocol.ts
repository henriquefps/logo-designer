// The app's client for the sync server's jobs and agent presence (docs/wireframe-mode.md → Phase 4 → Protocol).
// A local copy until the shared client (src/sync/jobs.ts, workstream 1) lands on main; same routes, same shapes.
// Lists are read leniently ({items}, {jobs} / {agents}, or a bare array) so a server detail does not break the app.
import { normalizeServerUrl, SyncError, type Connection } from '@/sync/api';
import type { ScreenPlatform } from '@/model';

export type JobType = 'screenshot' | 'next-screen' | 'adapt' | 'request';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ScreenshotInput {
  platform: ScreenPlatform;
  name?: string;
  hint?: string;
}
export interface NextScreenInput {
  fromScreenId: string;
  fromNodeId: string;
  fromPart?: string;
  label: string;
  platform: ScreenPlatform;
  hint?: string;
  at: { x: number; y: number };
}
export interface AdaptInput {
  screenId: string;
  fromPlatform: ScreenPlatform;
  toPlatform: ScreenPlatform;
  hint?: string;
}
export interface RequestInput {
  text: string;
}
export type JobInput = ScreenshotInput | NextScreenInput | AdaptInput | RequestInput;

export interface Attachment {
  name: string;
  mime: string;
  dataBase64: string;
}

export interface CreateJobBody {
  id: string;
  type: JobType;
  projectId: string;
  screenId?: string;
  frameId?: string;
  input: JobInput;
  attachments?: Attachment[];
}

export interface JobProgress {
  at: number;
  message: string;
  stage?: string;
}

export interface Job {
  id: string;
  type: JobType;
  projectId: string;
  screenId?: string;
  frameId?: string;
  input?: JobInput;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  agentId?: string;
  cancelRequested?: boolean;
  summary?: string;
  error?: string;
  progress?: JobProgress[];
}

export interface AgentInfo {
  agentId: string;
  name: string;
  host: string;
  version?: string;
  busy: boolean;
  jobId?: string;
  seenAt?: number;
}

/** Server events about jobs and presence, on the same `/api/events` stream as projects and fonts. */
export type AgentEvent = { kind: 'jobs'; id: string; status?: JobStatus; updatedAt?: number } | { kind: 'agents' };

export function parseAgentEvent(data: string): AgentEvent | null {
  try {
    const v = JSON.parse(data) as { kind?: unknown; id?: unknown; status?: unknown; updatedAt?: unknown };
    if (v.kind === 'jobs' && typeof v.id === 'string') {
      return { kind: 'jobs', id: v.id, ...(isStatus(v.status) ? { status: v.status } : {}), ...(typeof v.updatedAt === 'number' ? { updatedAt: v.updatedAt } : {}) };
    }
    if (v.kind === 'agents') return { kind: 'agents' };
  } catch {
    // ignore
  }
  return null;
}

const STATUSES: readonly JobStatus[] = ['queued', 'running', 'done', 'failed', 'cancelled'];
export const isStatus = (s: unknown): s is JobStatus => typeof s === 'string' && (STATUSES as readonly string[]).includes(s);
export const isFinished = (s: JobStatus) => s === 'done' || s === 'failed' || s === 'cancelled';

/** A 404 from a server that predates jobs (designer-sync < 0.3.0). */
export class NoJobsError extends Error {}

async function call<T>(conn: Connection, method: string, path: string, body?: unknown): Promise<T> {
  const base = normalizeServerUrl(conn.url);
  if (!base) throw new SyncError('No sync server address configured.', 'rejected');
  const headers: Record<string, string> = {};
  if (conn.apiKey?.trim()) headers.Authorization = `Bearer ${conn.apiKey.trim()}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  } catch {
    throw new SyncError('Could not reach the sync server.', 'offline');
  }
  if (res.status === 401) throw new SyncError('The sync server rejected the request: missing or wrong API key.', 'auth');
  if (res.status === 404 && (path === '/api/agents' || path.startsWith('/api/jobs?'))) throw new NoJobsError('This sync server has no jobs (update designer-sync to 0.3.0 or later).');
  if (!res.ok) {
    const msg = await res
      .json()
      .then((j: { error?: string }) => j.error)
      .catch(() => undefined);
    throw new SyncError(msg ?? `The sync server answered HTTP ${res.status}.`, res.status >= 500 ? 'server' : 'rejected');
  }
  return (await res.json().catch(() => ({}))) as T;
}

function listOf<T>(v: unknown, key: string): T[] {
  if (Array.isArray(v)) return v as T[];
  const o = v as Record<string, unknown> | null;
  if (o && Array.isArray(o.items)) return o.items as T[];
  if (o && Array.isArray(o[key])) return o[key] as T[];
  return [];
}

export const createJob = (conn: Connection, body: CreateJobBody) => call<Job>(conn, 'POST', '/api/jobs', body);

export const listJobs = async (conn: Connection, q: { projectId?: string; active?: boolean }) => {
  const qs = q.projectId ? `projectId=${encodeURIComponent(q.projectId)}` : 'active=1';
  return listOf<Job>(await call(conn, 'GET', `/api/jobs?${qs}`), 'jobs');
};

export const getJob = (conn: Connection, id: string) => call<Job>(conn, 'GET', `/api/jobs/${encodeURIComponent(id)}`);

export const cancelJob = (conn: Connection, id: string) => call<unknown>(conn, 'POST', `/api/jobs/${encodeURIComponent(id)}/cancel`, {});

export const listAgents = async (conn: Connection) => listOf<AgentInfo>(await call(conn, 'GET', '/api/agents'), 'agents');
