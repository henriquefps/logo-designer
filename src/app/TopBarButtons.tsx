import { ArrowsClockwiseIcon, CloudCheckIcon, CloudSlashIcon, CloudWarningIcon, CloudArrowUpIcon, TerminalWindowIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/useEditorStore';
import { relativeDate } from '@/lib/relativeDate';
import { useSyncStore } from '@/sync/engine';
import { syncView } from '@/sync/view';
import { cn } from '@/lib/utils';

const ICONS = { unset: CloudSlashIcon, syncing: ArrowsClockwiseIcon, synced: CloudCheckIcon, queued: CloudArrowUpIcon, offline: CloudSlashIcon, error: CloudWarningIcon } as const;

function host(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).host;
  } catch {
    return url;
  }
}

/** Sync status in the top bar, next to the theme toggle. Click opens the Sync dialog (which links the /sync guide). */
export function SyncButton() {
  const settings = useSyncStore((s) => s.settings);
  const status = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pending);
  const error = useSyncStore((s) => s.error);
  const last = useSyncStore((s) => s.lastSyncedAt);
  const view = syncView({ enabled: settings.enabled, url: settings.url, status, pending });
  const Icon = ICONS[view];
  const waiting = `${pending} ${pending === 1 ? 'change' : 'changes'} waiting`;

  const [label, detail] = {
    unset: ['Sync', 'Sync is off. Set it up to keep your projects in step across devices.'],
    syncing: ['Syncing…', `Syncing with ${host(settings.url)}…`],
    synced: ['Synced', `Last sync ${last ? relativeDate(last) : 'just now'} · ${host(settings.url)}`],
    queued: [`${pending} to sync`, `${waiting} to sync · ${host(settings.url)}`],
    offline: [pending > 0 ? `Offline · ${pending}` : 'Offline', `${host(settings.url)} is not reachable.${pending > 0 ? ` ${waiting}, saved on this device.` : ''}`],
    error: ['Sync error', error ?? 'Sync failed'],
  }[view];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('lg:w-auto lg:px-2.5', view === 'error' && 'text-destructive hover:text-destructive', view === 'unset' && 'text-muted-foreground')}
          aria-label={`${label}. Open sync settings`}
          data-sync-state={view}
          onClick={() => useEditorStore.getState().openDialog('sync')}
        >
          <Icon className={cn(view === 'syncing' && 'animate-spin')} />
          <span className="hidden text-[0.8125rem] lg:inline">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{detail}</TooltipContent>
    </Tooltip>
  );
}

/** Desktop only: the phone layout has the same entry in Menu → Help. */
export function CliButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="CLI & agents" onClick={() => useEditorStore.getState().openDialog('cli')}>
          <TerminalWindowIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>CLI &amp; agents: let your AI agent draw for you</TooltipContent>
    </Tooltip>
  );
}
