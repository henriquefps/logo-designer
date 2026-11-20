import { BroadcastIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProjectsStore } from '@/store/useProjectsStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useSyncStore } from '@/sync/engine';
import { LIVE_EDITOR_LABEL, liveEditor } from '@/sync/live';
import { deviceId } from '@/sync/state';

/** "Live" next to the sync button while the open project is edited live (`designer live`), with who changed it last. */
export function LiveIndicator() {
  const meta = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeId));
  const syncOn = useSyncStore((s) => s.settings.enabled && s.settings.url.trim().length > 0);
  const stream = useSyncStore((s) => s.stream);
  if (!meta?.live) return null;
  const by = LIVE_EDITOR_LABEL[liveEditor(meta.live, deviceId())];
  const time = new Date(meta.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const how = !syncOn
    ? 'Sync is off on this device, so the agent’s changes do not arrive. Turn it on in File → Sync….'
    : stream === 'open'
      ? 'Changes arrive as they happen, and yours reach the agent within about a second.'
      : stream === 'unsupported'
        ? 'This sync server has no live event stream (update designer-sync), so changes arrive every 30 s.'
        : 'Reconnecting to the live event stream; meanwhile changes arrive every 30 s.';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-[0.8125rem]" aria-label={`Live: last changed by ${by}`} data-live-by={liveEditor(meta.live, deviceId())}>
          <span className="relative flex size-2">
            {syncOn && stream === 'open' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />}
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span>Live</span>
          <span className="hidden text-muted-foreground xl:inline">· {by}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="gap-3">
        <div className="flex items-center gap-2 font-medium">
          <BroadcastIcon className="size-4" /> Live editing
        </div>
        <p className="text-muted-foreground">
          An agent is editing this project with <code className="text-foreground">designer live</code>. Last change by{' '}
          <span className="text-foreground" data-testid="live-by">
            {by}
          </span>{' '}
          at {time}.
        </p>
        <p className="text-muted-foreground">{how}</p>
        <div className="flex justify-end gap-2">
          {!syncOn && (
            <Button size="sm" variant="outline" onClick={() => useEditorStore.getState().openDialog('sync')}>
              Sync…
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => useProjectsStore.getState().stopLive()}>
            Stop live
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
