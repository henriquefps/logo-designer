import { useEffect, useState } from 'react';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { useAgentStore } from '../agentStore';
import { jobRows, type JobRow } from '../jobs';

/** The open project's job rows, re-computed every second while one runs (elapsed time). */
export function useJobRows(): JobRow[] {
  const jobs = useAgentStore((s) => s.jobs);
  const snapshots = useAgentStore((s) => s.snapshots);
  const undone = useAgentStore((s) => s.undone);
  const dismissed = useAgentStore((s) => s.dismissed);
  const projectId = useProjectsStore((s) => s.activeId);
  const doc = useDocStore((s) => s.doc);
  const [now, setNow] = useState(() => Date.now());
  const rows = jobRows(jobs, { projectId, doc, now, dismissed, snapshots, undone });
  const ticking = rows.some((r) => r.status === 'running' || r.status === 'queued');
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return rows;
}
