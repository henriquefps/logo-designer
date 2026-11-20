// Client for the sync server's agent jobs (docs/wireframe-mode.md → Phase 4, docs/sync.md → Jobs): the
// app creates jobs ("turn this screenshot into a wireframe"), `designer agent` claims and runs them, both
// follow them on the event stream. Plain `fetch` through the same auth and error handling as api.ts, so it
// runs in the browser and in Bun.
import { rawRequest, SyncError, type Connection } from './api';
import { base64ToBytes, bytesToBase64 } from './base64';

// --- Types (the wire format is the Protocol section of docs/wireframe-mode.md) --------------------------

export type JobType = 'screenshot' | 'next-screen' | 'adapt' | 'request';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type FinalJobStatus = Exclude<JobStatus, 'queued' | 'running'>;

export interface ScreenshotInput {
  platform: string;
  name?: string;
  hint?: string;
}
export interface NextScreenInput {
  fromScreenId: string;
  fromNodeId: string;
  fromPart?: string;
  label: string;
  platform: string;
  hint?: string;
  at: { x: number; y: number };
}
export interface AdaptInput {
  screenId: string;
  fromPlatform: string;
  toPlatform: string;
  hint?: string;
}
export interface RequestInput {
  text: string;
}

export interface JobInputByType {
  screenshot: ScreenshotInput;
  'next-screen': NextScreenInput;
  adapt: AdaptInput;
  request: RequestInput;
}

/** An attachment as the app sends it. */
export interface AttachmentUpload {
  name: string;
  mime: string;
  dataBase64: string;
}

/** An attachment as the server describes it. */
export interface AttachmentMeta {
  name: string;
  mime: string;
  size: number;
}

export interface JobProgress {
  at: number;
  message: string;
  stage?: string;
}

interface JobBase<T extends JobType = JobType> {
  id: string;
  type: T;
  projectId: string;
  screenId?: string;
  frameId?: string;
  input: JobInputByType[T];
  attachments: AttachmentMeta[];
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** The agent that claimed it. */
  agentId?: string;
  cancelRequested: boolean;
  summary?: string;
  error?: string;
  /** Attachments are deleted 24 h after the job finishes. */
  attachmentsDeleted?: boolean;
}

/** A job as `GET /api/jobs/<id>` returns it. */
export type Job<T extends JobType = JobType> = JobBase<T> & { progress: JobProgress[] };

/** A job as the listing returns it: no progress log, its size and its last line instead. */
export type JobMeta<T extends JobType = JobType> = JobBase<T> & { progressCount: number; lastProgress?: JobProgress };

/** The body of `POST /api/jobs`; ids are client-generated. */
export interface CreateJobBody<T extends JobType = JobType> {
  id: string;
  type: T;
  projectId: string;
  screenId?: string;
  frameId?: string;
  input: JobInputByType[T];
  attachments?: AttachmentUpload[];
}

export interface ProgressBody {
  agentId: string;
  message: string;
  stage?: string;
}
export interface ProgressResult {
  status: JobStatus;
  /** Set when the app asked to cancel: the agent should stop and finish the job as `cancelled`. */
  cancelRequested: boolean;
  progressCount: number;
}

export interface FinishBody {
  agentId: string;
  status: FinalJobStatus;
  summary?: string;
  error?: string;
}

export interface HeartbeatBody {
  agentId: string;
  name: string;
  host: string;
  version: string;
  busy: boolean;
  jobId?: string;
  /** `'offline'` is the goodbye of a bridge that stops cleanly: the server marks it offline at once. Default `'online'`. */
  status?: 'online' | 'offline';
}

/** An agent seen on the server in the last 45 seconds. */
export interface AgentInfo {
  agentId: string;
  name: string;
  host: string;
  version: string;
  busy: boolean;
  jobId?: string;
  lastSeen: number;
}

export interface JobEvent {
  kind: 'jobs';
  id: string;
  status: JobStatus;
  updatedAt: number;
}
export type AgentStatus = 'online' | 'busy' | 'offline';
export interface AgentsEvent {
  kind: 'agents';
  id: string;
  status: AgentStatus;
  updatedAt: number;
}

/** The agent presence heartbeat interval; the server lists agents seen in the last 45 s. */
export const HEARTBEAT_MS = 15_000;
/** A running job whose agent is silent this long is failed by the server. */
export const AGENT_DEAD_AFTER_MS = 120_000;

export const isFinished = (status: JobStatus): status is FinalJobStatus => status === 'done' || status === 'failed' || status === 'cancelled';
export const isActive = (status: JobStatus) => !isFinished(status);

// --- Events ---------------------------------------------------------------------------------------------

const JOB_STATUSES: readonly string[] = ['queued', 'running', 'done', 'failed', 'cancelled'];
const AGENT_STATUSES: readonly string[] = ['online', 'busy', 'offline'];

/** The `data` of a `change` event if it is a job event; `null` for anything else. */
export function parseJobEvent(data: string): JobEvent | null {
  try {
    const v = JSON.parse(data) as Partial<JobEvent>;
    if (v.kind === 'jobs' && typeof v.id === 'string' && typeof v.updatedAt === 'number' && typeof v.status === 'string' && JOB_STATUSES.includes(v.status)) {
      return { kind: 'jobs', id: v.id, status: v.status, updatedAt: v.updatedAt };
    }
  } catch {
    // ignore a malformed event
  }
  return null;
}

/** The `data` of a `change` event if it is an agent presence event; `null` for anything else. */
export function parseAgentsEvent(data: string): AgentsEvent | null {
  try {
    const v = JSON.parse(data) as Partial<AgentsEvent>;
    if (v.kind === 'agents' && typeof v.id === 'string' && typeof v.updatedAt === 'number' && typeof v.status === 'string' && AGENT_STATUSES.includes(v.status)) {
      return { kind: 'agents', id: v.id, status: v.status, updatedAt: v.updatedAt };
    }
  } catch {
    // ignore a malformed event
  }
  return null;
}

// --- Requests -------------------------------------------------------------------------------------------

const enc = encodeURIComponent;

async function json<T>(conn: Connection, method: string, path: string, body?: unknown): Promise<T> {
  const res = await rawRequest(conn, method, path, body);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SyncError('The sync server returned an unexpected response. Is this the Designer sync server?', 'server');
  }
}

/** True when the server has the job queue (`/api/health` says `jobs: true`); older servers do not. */
export async function serverHasJobs(conn: Connection): Promise<boolean> {
  const h = await json<{ jobs?: boolean }>(conn, 'GET', '/api/health');
  return h.jobs === true;
}

/** Queues a job. Resolves with the stored job (status `queued`); a repeated id is refused (HTTP 409). */
export const createJob = <T extends JobType>(conn: Connection, body: CreateJobBody<T>) => json<Job<T>>(conn, 'POST', '/api/jobs', body);

/** Job metadata, newest first. `active` keeps queued and running jobs; `projectId` one project's. */
export async function listJobs(conn: Connection, filter: { active?: boolean; projectId?: string } = {}): Promise<JobMeta[]> {
  const q = new URLSearchParams();
  if (filter.active) q.set('active', '1');
  if (filter.projectId) q.set('projectId', filter.projectId);
  const qs = q.toString();
  const data = await json<{ items?: JobMeta[] }>(conn, 'GET', `/api/jobs${qs ? `?${qs}` : ''}`);
  if (!Array.isArray(data.items)) throw new SyncError('The sync server returned an unexpected response. Is this the Designer sync server?', 'server');
  return data.items;
}

export const getJob = (conn: Connection, id: string) => json<Job>(conn, 'GET', `/api/jobs/${enc(id)}`);

/** Downloads one attachment of a job (404 once its job finished more than 24 h ago). */
export async function getAttachment(conn: Connection, jobId: string, name: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await rawRequest(conn, 'GET', `/api/jobs/${enc(jobId)}/attachments/${enc(name)}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get('Content-Type') ?? 'application/octet-stream' };
}

/** Claims a queued job. Resolves with the job when this agent won it, `null` when another agent (or a cancel) got there first. */
export async function claimJob(conn: Connection, id: string, agentId: string): Promise<Job | null> {
  try {
    return await json<Job>(conn, 'POST', `/api/jobs/${enc(id)}/claim`, { agentId });
  } catch (e) {
    if (e instanceof SyncError && e.status === 409) return null;
    throw e;
  }
}

/** Appends a line to a running job's log (only its agent can). The answer says whether the app asked to cancel. */
export const reportProgress = (conn: Connection, id: string, body: ProgressBody) =>
  json<ProgressResult>(conn, 'POST', `/api/jobs/${enc(id)}/progress`, body);

/** Ends a running job (only its agent can). */
export const finishJob = (conn: Connection, id: string, body: FinishBody) => json<Job>(conn, 'POST', `/api/jobs/${enc(id)}/finish`, body);

/** The app's cancel: a queued job is cancelled at once; a running one gets `cancelRequested` and its agent finishes it. */
export const cancelJob = (conn: Connection, id: string) => json<Job>(conn, 'POST', `/api/jobs/${enc(id)}/cancel`, {});

/** Presence: call every 15 s (`HEARTBEAT_MS`); one last time with `status: 'offline'` when the agent stops cleanly. */
export const sendHeartbeat = (conn: Connection, body: HeartbeatBody) =>
  json<{ ok: boolean }>(conn, 'POST', '/api/agents/heartbeat', body);

/** Agents seen in the last 45 s. */
export async function listAgents(conn: Connection): Promise<AgentInfo[]> {
  const data = await json<{ items?: AgentInfo[] }>(conn, 'GET', '/api/agents');
  if (!Array.isArray(data.items)) throw new SyncError('The sync server returned an unexpected response. Is this the Designer sync server?', 'server');
  return data.items;
}

// --- Attachments ----------------------------------------------------------------------------------------

/** An attachment from bytes (a pasted or dropped image), ready for `createJob`. */
export const attachmentFromBytes = (name: string, mime: string, bytes: ArrayBuffer | Uint8Array): AttachmentUpload => ({
  name,
  mime,
  dataBase64: bytesToBase64(bytes instanceof Uint8Array ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : bytes),
});

/** The bytes of an `AttachmentUpload`. */
export const attachmentBytes = (a: AttachmentUpload): Uint8Array => new Uint8Array(base64ToBytes(a.dataBase64));

/** A job id the app can generate: sortable by time, URL- and file-name safe, accepted by the server (≤ 80 of [A-Za-z0-9_-]). */
export const newJobId = (): string => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
