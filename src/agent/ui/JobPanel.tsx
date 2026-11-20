import { useState } from 'react';
import { ArrowCounterClockwiseIcon, CheckCircleIcon, CircleNotchIcon, ClockIcon, MinusIcon, ProhibitIcon, SparkleIcon, WarningCircleIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useDocStore } from '@/store/useDocStore';
import { cn } from '@/lib/utils';
import { requestCancel, undoAgentChanges, useAgentStore } from '../agentStore';
import type { JobRow } from '../jobs';
import { useJobRows } from './useJobRows';
import type { JobStatus } from '@/sync/jobs';

const ICON: Record<JobStatus, typeof CheckCircleIcon> = {
  queued: ClockIcon,
  running: CircleNotchIcon,
  done: CheckCircleIcon,
  failed: WarningCircleIcon,
  cancelled: ProhibitIcon,
};

function Row({ row }: { row: JobRow }) {
  const Icon = ICON[row.status];
  const [undoing, setUndoing] = useState(false);
  const dismiss = useAgentStore((s) => s.dismiss);
  const over = row.status === 'done' || row.status === 'failed' || row.status === 'cancelled';
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5" data-testid="agent-job" data-job-id={row.id} data-status={row.status}>
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            'mt-0.5 size-4 shrink-0',
            row.status === 'running' && 'animate-spin text-primary',
            row.status === 'done' && 'text-primary',
            row.status === 'failed' && 'text-destructive',
            (row.status === 'queued' || row.status === 'cancelled') && 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={row.title}>
            {row.title}
          </div>
          <div className="flex gap-1.5 text-xs text-muted-foreground">
            <span data-testid="agent-job-status">{row.statusLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums" data-testid="agent-job-elapsed">
              {row.elapsed}
            </span>
          </div>
        </div>
        {over && (
          <Button size="icon-sm" variant="ghost" className="-mt-0.5 -mr-1 size-6" aria-label="Dismiss" title="Dismiss" onClick={() => dismiss(row.id)}>
            <XIcon />
          </Button>
        )}
      </div>
      {!over && row.latest && (
        <p className="truncate pl-6 text-xs" data-testid="agent-job-progress" title={row.latest}>
          {row.latest}
        </p>
      )}
      {row.status === 'running' && (
        <p className="flex gap-1 pl-6 text-xs text-muted-foreground" data-testid="agent-job-warning">
          <WarningIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Keep editing if you like; edits on {row.screen ? `“${row.screen}”` : 'the screens the agent works on'} may be overwritten.
          </span>
        </p>
      )}
      {over && row.summary && (
        <p className="pl-6 text-xs whitespace-pre-line" data-testid="agent-job-summary">
          {row.summary}
        </p>
      )}
      {row.error && (
        <p className="pl-6 text-xs text-destructive" data-testid="agent-job-error">
          {row.error}
        </p>
      )}
      {row.undone && <p className="pl-6 text-xs text-muted-foreground">The agent’s changes were undone (Edit → Undo brings them back).</p>}
      <div className="flex justify-end gap-1.5 empty:hidden">
        {(row.canCancel || row.cancelling) && (
          <Button size="sm" variant="outline" className="h-7" disabled={row.cancelling} onClick={() => void requestCancel(row.id)}>
            {row.cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
        {row.canUndo && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={undoing}
            onClick={() => {
              setUndoing(true);
              void undoAgentChanges(row.id).finally(() => setUndoing(false));
            }}
          >
            <ArrowCounterClockwiseIcon data-icon="inline-start" />
            Undo the agent’s changes
          </Button>
        )}
      </div>
    </li>
  );
}

/** A small floating panel over the canvas, one row per running or recent job of the open project. */
export function JobPanel() {
  const rows = useJobRows();
  const open = useAgentStore((s) => s.panelOpen);
  const setOpen = useAgentStore((s) => s.setPanelOpen);
  const wireframe = useDocStore((s) => !!s.doc.wireframe);
  if (!wireframe || !open || !rows.length) return null;
  return (
    <section
      aria-label="Agent jobs"
      data-testid="agent-job-panel"
      className="absolute right-3 bottom-3 z-30 flex max-h-[min(28rem,calc(100%-1.5rem))] w-80 flex-col overflow-hidden rounded-lg border bg-popover text-sm text-popover-foreground shadow-md"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <SparkleIcon className="size-4 text-primary" aria-hidden="true" />
        <span className="flex-1 font-medium">Agent jobs</span>
        <Button size="icon-sm" variant="ghost" className="size-7" aria-label="Hide agent jobs" title="Hide (the agent status in the status bar shows them again)" onClick={() => setOpen(false)}>
          <MinusIcon />
        </Button>
      </header>
      <ul className="min-h-0 divide-y overflow-y-auto">
        {rows.map((r) => (
          <Row key={r.id} row={r} />
        ))}
      </ul>
    </section>
  );
}
