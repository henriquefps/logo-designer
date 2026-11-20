// Sending a job (docs/wireframe-mode.md → Phase 4 → The app): the project is flushed to the sync server (the agent
// pulls it from there) and marked live (its edits come back within a second), a snapshot is taken for "Undo the
// agent's changes", then the job is created.
import { toast } from 'sonner';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { getItem } from '@/sync/api';
import { syncConnection, syncNow, useSyncStore } from '@/sync/engine';
import { addSnapshotMark, currentPresence, putJob } from './agentStore';
import { availability } from './jobs';
import { createJob, newJobId, type CreateJobBody, type JobType } from '@/sync/jobs';
import type { AppJob } from './jobs';
import { saveSnapshot } from './snapshots';

/** A job to send, without the ids this module adds. */
export type JobSpec = { [T in JobType]: Omit<CreateJobBody<T>, 'id' | 'projectId'> }[JobType];

/** Whether the open document can send a job now (the reason is the tooltip of a disabled entry point). */
export const canSendNow = () => availability(currentPresence(), { wireframe: !!useDocStore.getState().doc.wireframe });

/** Makes sure the server has the open project as it is now, marked live. Throws with a message for the user. */
export async function flushToServer(): Promise<void> {
  const conn = syncConnection();
  if (!conn) throw new Error('Sync is off: turn it on in File → Sync….');
  const projects = useProjectsStore.getState();
  await projects.flush();
  await projects.markLive();
  const id = useProjectsStore.getState().activeId;
  if (!id) throw new Error('No project is open.');
  const want = useProjectsStore.getState().projects.find((p) => p.id === id)?.updatedAt ?? 0;
  // Two tries: a sync already running when we asked may have started before the live mark was saved.
  for (let i = 0; i < 2; i++) {
    await syncNow();
    const rec = await getItem(conn, 'projects', id).catch(() => null);
    if (rec && !rec.deleted && rec.updatedAt >= want) return;
  }
  const err = useSyncStore.getState().error;
  throw new Error(`The project could not be saved to the sync server${err ? `: ${err}` : '.'}`);
}

/** Flush + live + snapshot + create. Returns the job, or null (the reason was shown in a toast). */
export async function sendJob(spec: JobSpec): Promise<AppJob | null> {
  const ok = canSendNow();
  if (!ok.ok) {
    toast.error('The agent is not available', { description: ok.reason });
    return null;
  }
  const conn = syncConnection()!;
  try {
    await flushToServer();
    const projectId = useProjectsStore.getState().activeId!;
    const id = newJobId();
    await saveSnapshot(id, useDocStore.getState().doc).then(
      () => addSnapshotMark(id),
      () => undefined, // without a snapshot the job still runs; the panel offers no undo
    );
    const job = await createJob(conn, { id, projectId, ...spec } as CreateJobBody);
    putJob(job);
    return job;
  } catch (e) {
    toast.error('Could not send the job to the agent', { description: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
