// Pure parts of the app's agent support (docs/wireframe-mode.md → Phase 4 → The app): merging server jobs and
// events into the local state, the job panel's rows, agent presence and whether an entry point can send a job.
import { platformDef, type DesignDocument } from '@/model';
import { logicalScreen } from '@/wireframe/screens';
import { isFinished, type AgentEvent, type AgentInfo, type Job, type JobStatus, type NextScreenInput, type AdaptInput, type ScreenshotInput, type RequestInput } from './protocol';

export type Jobs = Record<string, Job>;

/** A job from the server (list or full read): kept unless what we have is newer. Progress survives a metadata-only list. */
export function upsertJob(jobs: Jobs, job: Job): Jobs {
  const cur = jobs[job.id];
  if (cur && cur.updatedAt > job.updatedAt) return jobs;
  const progress = job.progress ?? cur?.progress;
  const next: Job = { ...cur, ...job, ...(progress ? { progress } : {}) };
  return { ...jobs, [job.id]: next };
}

/**
 * A `jobs` event: the status is applied at once (the full read follows). Returns the jobs and whether the full job
 * should be read (it is ours to show: known here, or of the project open now).
 */
export function applyJobEvent(jobs: Jobs, ev: Extract<AgentEvent, { kind: 'jobs' }>, activeProject: string | null): { jobs: Jobs; fetch: boolean } {
  const cur = jobs[ev.id];
  if (!cur) return { jobs, fetch: activeProject !== null };
  if (ev.updatedAt !== undefined && ev.updatedAt < cur.updatedAt) return { jobs, fetch: false };
  if (!ev.status || ev.status === cur.status) return { jobs, fetch: true };
  return { jobs: { ...jobs, [ev.id]: { ...cur, status: ev.status, ...(ev.updatedAt !== undefined ? { updatedAt: ev.updatedAt } : {}) } }, fetch: true };
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Waiting for the agent',
  running: 'Working',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const screenName = (doc: DesignDocument | null, id: string | undefined) => (doc && id ? (logicalScreen(doc, id)?.name ?? null) : null);

/** What the job is, in a few words ("Next screen “Settings”", "Adapt “Home” to tablet"). */
export function jobTitle(job: Job, doc: DesignDocument | null): string {
  const input = job.input as Record<string, unknown> | undefined;
  switch (job.type) {
    case 'screenshot': {
      const i = input as Partial<ScreenshotInput> | undefined;
      return i?.name ? `Screenshot → “${i.name}”` : 'Screenshot → wireframe';
    }
    case 'next-screen': {
      const i = input as Partial<NextScreenInput> | undefined;
      return `Next screen “${screenName(doc, job.screenId) ?? i?.label ?? 'screen'}”`;
    }
    case 'adapt': {
      const i = input as Partial<AdaptInput> | undefined;
      const to = i?.toPlatform ? platformDef(i.toPlatform).label.toLowerCase() : 'another platform';
      return `Adapt “${screenName(doc, i?.screenId ?? job.screenId) ?? 'screen'}” to ${to}`;
    }
    case 'request': {
      const t = (input as Partial<RequestInput> | undefined)?.text?.trim() ?? '';
      return t ? `Ask: “${t.length > 40 ? `${t.slice(0, 39)}…` : t}”` : 'Request';
    }
  }
}

export function latestProgress(job: Job): string | null {
  const p = job.progress;
  return p?.length ? p[p.length - 1].message : null;
}

/** Time spent: from start (or creation while queued) to the end, or to `now` while it runs. */
export function elapsedMs(job: Job, now: number): number {
  const start = job.startedAt ?? job.createdAt;
  const end = isFinished(job.status) ? (job.finishedAt ?? job.updatedAt) : now;
  return Math.max(0, end - start);
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export interface JobRow {
  id: string;
  title: string;
  status: JobStatus;
  statusLabel: string;
  latest: string | null;
  elapsed: string;
  canCancel: boolean;
  cancelling: boolean;
  summary: string | null;
  error: string | null;
  /** A snapshot taken at send exists, the job is over and its changes were not undone yet. */
  canUndo: boolean;
  undone: boolean;
  /** The screen the agent works on, for the "edits may be overwritten" warning. */
  screen: string | null;
}

/** Finished jobs stay in the panel this long (running and queued ones always show). */
export const RECENT_MS = 24 * 60 * 60_000;
export const MAX_ROWS = 6;

/** The panel's rows for the open project: running and queued first, then the recent finished ones, newest first. */
export function jobRows(
  jobs: Jobs,
  opts: { projectId: string | null; doc: DesignDocument | null; now: number; dismissed?: ReadonlySet<string>; snapshots?: ReadonlySet<string>; undone?: ReadonlySet<string> },
): JobRow[] {
  if (!opts.projectId) return [];
  const list = Object.values(jobs)
    .filter((j) => j.projectId === opts.projectId && !opts.dismissed?.has(j.id))
    .filter((j) => !isFinished(j.status) || opts.now - (j.finishedAt ?? j.updatedAt) < RECENT_MS)
    .sort((a, b) => Number(isFinished(a.status)) - Number(isFinished(b.status)) || b.createdAt - a.createdAt)
    .slice(0, MAX_ROWS);
  return list.map((j) => {
    const over = isFinished(j.status);
    const undone = !!opts.undone?.has(j.id);
    const input = j.input as Partial<AdaptInput> | undefined;
    return {
      id: j.id,
      title: jobTitle(j, opts.doc),
      status: j.status,
      statusLabel: j.cancelRequested && !over ? 'Cancelling…' : STATUS_LABEL[j.status],
      latest: latestProgress(j),
      elapsed: formatElapsed(elapsedMs(j, opts.now)),
      canCancel: !over && !j.cancelRequested,
      cancelling: !over && !!j.cancelRequested,
      summary: over ? (j.summary?.trim() ?? null) || null : null,
      error: j.status === 'failed' ? (j.error?.trim() ?? null) || null : null,
      canUndo: over && !undone && !!opts.snapshots?.has(j.id),
      undone,
      screen: screenName(opts.doc, j.screenId ?? input?.screenId),
    };
  });
}

// ---------- presence ----------

export type Presence =
  | { kind: 'no-sync' }
  | { kind: 'unsupported' }
  | { kind: 'unreachable'; message: string }
  | { kind: 'checking' }
  | { kind: 'offline' }
  | { kind: 'online'; agent: AgentInfo; count: number }
  | { kind: 'busy'; agent: AgentInfo; count: number };

export interface PresenceInput {
  syncConfigured: boolean;
  agents: AgentInfo[] | null;
  /** The last presence read failed: an older server (`unsupported`) or not reachable. */
  error: { kind: 'unsupported' } | { kind: 'unreachable'; message: string } | null;
}

export function presenceOf(s: PresenceInput): Presence {
  if (!s.syncConfigured) return { kind: 'no-sync' };
  if (s.error) return s.error;
  if (!s.agents) return { kind: 'checking' };
  if (!s.agents.length) return { kind: 'offline' };
  // An idle agent first: a job sent now starts at once.
  const agent = s.agents.find((a) => !a.busy) ?? s.agents[0];
  return { kind: agent.busy ? 'busy' : 'online', agent, count: s.agents.length };
}

export const agentName = (a: AgentInfo) => a.name?.trim() || a.host?.trim() || 'an agent';

export function presenceLabel(p: Presence): string {
  switch (p.kind) {
    case 'no-sync':
      return 'No sync server';
    case 'unsupported':
      return 'Agent: update the sync server';
    case 'unreachable':
      return 'Agent: server unreachable';
    case 'checking':
      return 'Agent…';
    case 'offline':
      return 'Agent offline';
    case 'online':
      return `Agent online on ${agentName(p.agent)}`;
    case 'busy':
      return `Agent busy on ${agentName(p.agent)}`;
  }
}

export type Availability = { ok: true } | { ok: false; reason: string };

/** Whether an entry point can send a job now; the reason is the disabled control's tooltip. */
export function availability(p: Presence, opts: { wireframe: boolean }): Availability {
  if (!opts.wireframe) return { ok: false, reason: 'The agent works on wireframe documents.' };
  switch (p.kind) {
    case 'no-sync':
      return { ok: false, reason: 'Turn on Sync (File → Sync…): the agent works through your sync server.' };
    case 'unsupported':
      return { ok: false, reason: 'Your sync server has no agent jobs yet: update designer-sync to 0.3.0 or later.' };
    case 'unreachable':
      return { ok: false, reason: `The sync server cannot be reached: ${p.message}` };
    case 'checking':
      return { ok: false, reason: 'Looking for an agent…' };
    case 'offline':
      return { ok: false, reason: 'No agent online. Start `designer agent` on your machine.' };
    case 'online':
    case 'busy':
      return { ok: true };
  }
}
