// The app's agent state: who is online, this device's view of the jobs, and which jobs can be undone. Fed by the
// sync server (presence every 15 s, job lists, and the `jobs` / `agents` events on the sync stream).
import { create } from 'zustand';
import type { Draft } from 'immer';
import { toast } from 'sonner';
import type { DesignDocument } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { isSyncConfigured, onSyncStream, syncConnection, useSyncStore } from '@/sync/engine';
import { applyJobEvent, presenceOf, upsertJob, type Jobs, type Presence, type PresenceInput } from './jobs';
import { cancelJob, getJob, isFinished, listAgents, listJobs, NoJobsError, parseAgentEvent, type AgentInfo, type Job } from './protocol';
import { loadSnapshot, loadSnapshotIndex, restoredContent } from './snapshots';

interface AgentState {
  agents: AgentInfo[] | null;
  agentsError: PresenceInput['error'];
  jobs: Jobs;
  /** Jobs with a snapshot taken at send (Undo the agent's changes). */
  snapshots: Set<string>;
  /** Jobs whose changes were undone here. */
  undone: Set<string>;
  /** Rows closed in the panel. */
  dismissed: Set<string>;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  dismiss: (id: string) => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  agents: null,
  agentsError: null,
  jobs: {},
  snapshots: new Set(),
  undone: new Set(),
  dismissed: new Set(),
  panelOpen: true,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  dismiss: (id) => set((s) => ({ dismissed: new Set(s.dismissed).add(id) })),
}));

export function usePresence(): Presence {
  const syncConfigured = useSyncStore((s) => s.settings.enabled && s.settings.url.trim().length > 0);
  const agents = useAgentStore((s) => s.agents);
  const error = useAgentStore((s) => s.agentsError);
  return presenceOf({ syncConfigured, agents, error });
}

export const currentPresence = (): Presence => {
  const s = useAgentStore.getState();
  return presenceOf({ syncConfigured: isSyncConfigured(), agents: s.agents, error: s.agentsError });
};

export function putJob(job: Job) {
  useAgentStore.setState((s) => ({ jobs: upsertJob(s.jobs, job), panelOpen: true }));
}

export function addSnapshotMark(jobId: string) {
  useAgentStore.setState((s) => ({ snapshots: new Set(s.snapshots).add(jobId) }));
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function refreshAgents(): Promise<void> {
  const conn = syncConnection();
  if (!conn) return void useAgentStore.setState({ agents: null, agentsError: null });
  try {
    const agents = await listAgents(conn);
    useAgentStore.setState({ agents, agentsError: null });
  } catch (e) {
    useAgentStore.setState({ agents: null, agentsError: e instanceof NoJobsError ? { kind: 'unsupported' } : { kind: 'unreachable', message: describe(e) } });
  }
}

export async function refreshJobs(projectId = useProjectsStore.getState().activeId): Promise<void> {
  const conn = syncConnection();
  if (!conn || !projectId) return;
  try {
    const list = await listJobs(conn, { projectId });
    useAgentStore.setState((s) => {
      let jobs = s.jobs;
      for (const j of list) jobs = upsertJob(jobs, j);
      return { jobs };
    });
    // The list is metadata only: read the running ones in full for their latest progress line.
    await Promise.all(list.filter((j) => !isFinished(j.status)).map((j) => refreshJob(j.id)));
  } catch {
    // An older server or offline: presence says so.
  }
}

export async function refreshJob(id: string): Promise<void> {
  const conn = syncConnection();
  if (!conn) return;
  try {
    const job = await getJob(conn, id);
    if (job?.id) useAgentStore.setState((s) => ({ jobs: upsertJob(s.jobs, job) }));
  } catch {
    // next event or poll
  }
}

export async function requestCancel(id: string): Promise<void> {
  const conn = syncConnection();
  if (!conn) return;
  const cur = useAgentStore.getState().jobs[id];
  if (cur) useAgentStore.setState((s) => ({ jobs: { ...s.jobs, [id]: { ...cur, cancelRequested: true } } }));
  try {
    await cancelJob(conn, id);
  } catch (e) {
    toast.error('Could not cancel the job', { description: describe(e) });
    if (cur) useAgentStore.setState((s) => ({ jobs: { ...s.jobs, [id]: cur } }));
  }
  await refreshJob(id);
}

/**
 * "Undo the agent's changes": the project goes back to the snapshot taken when the job was sent, as one edit
 * (so Edit → Undo brings the agent's version back, and the change is saved and synced like any other).
 */
export async function undoAgentChanges(jobId: string): Promise<boolean> {
  const snap = await loadSnapshot(jobId).catch(() => undefined);
  if (!snap) {
    toast.error('The snapshot of this job is gone, so its changes cannot be undone here.');
    return false;
  }
  const projects = useProjectsStore.getState();
  if (projects.activeId !== snap.id) await projects.open(snap.id);
  if (useProjectsStore.getState().activeId !== snap.id) {
    toast.error('The project of this job is not on this device.');
    return false;
  }
  const next = restoredContent(useDocStore.getState().doc, snap);
  useDocStore.getState().apply(
    (d) => {
      const draft = d as Draft<DesignDocument> & Record<string, unknown>;
      for (const k of Object.keys(draft)) if (!(k in next)) delete draft[k];
      Object.assign(draft, next);
    },
    { label: 'Undo the agent’s changes' },
  );
  await useProjectsStore.getState().flush();
  useAgentStore.setState((s) => ({ undone: new Set(s.undone).add(jobId) }));
  toast.success('The agent’s changes were undone', { description: 'Edit → Undo brings them back.' });
  return true;
}

const PRESENCE_MS = 15_000;
const JOBS_POLL_MS = 5_000;

/** Keeps presence and the open project's jobs up to date while sync is on. Returns a stop function. */
export function startAgent(): () => void {
  void loadSnapshotIndex().then((ids) => useAgentStore.setState((s) => ({ snapshots: new Set([...s.snapshots, ...ids]) })));
  const offStream = onSyncStream({
    onOpen: () => {
      void refreshAgents();
      void refreshJobs();
    },
    onOther: (_name, data) => {
      const ev = parseAgentEvent(data);
      if (!ev) return;
      if (ev.kind === 'agents') return void refreshAgents();
      const r = applyJobEvent(useAgentStore.getState().jobs, ev, useProjectsStore.getState().activeId);
      if (r.jobs !== useAgentStore.getState().jobs) useAgentStore.setState({ jobs: r.jobs });
      if (r.fetch) void refreshJob(ev.id);
    },
  });
  // Presence expires on the server (45 s): read it again now and then. Running jobs are read too, in case the
  // event stream is down.
  const presence = setInterval(() => void refreshAgents(), PRESENCE_MS);
  const poll = setInterval(() => {
    if (useSyncStore.getState().stream === 'open') return;
    const active = Object.values(useAgentStore.getState().jobs).filter((j) => !isFinished(j.status));
    for (const j of active) void refreshJob(j.id);
  }, JOBS_POLL_MS);
  const unsubProject = useProjectsStore.subscribe((s, prev) => {
    if (s.activeId !== prev.activeId) void refreshJobs(s.activeId);
  });
  const unsubSettings = useSyncStore.subscribe((s, prev) => {
    if (s.settings === prev.settings) return;
    void refreshAgents();
    void refreshJobs();
  });
  void refreshAgents();
  void refreshJobs();
  return () => {
    offStream();
    clearInterval(presence);
    clearInterval(poll);
    unsubProject();
    unsubSettings();
  };
}
