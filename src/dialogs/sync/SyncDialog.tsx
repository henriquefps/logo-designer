import { useState } from 'react';
import { ArrowClockwiseIcon, ArrowSquareOutIcon, CheckCircleIcon, CloudSlashIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { fullDate, relativeDate } from '@/lib/relativeDate';
import { syncNow, useSyncStore } from '@/sync/engine';
import { cn } from '@/lib/utils';

/** Settings → Sync: the server this device syncs with, and how the last sync went. */
export function SyncDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <SyncForm onClose={() => onOpenChange(false)} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// Mounted each time the dialog opens, so the typed values start from the saved settings.
function SyncForm({ onClose }: { onClose: () => void }) {
  const settings = useSyncStore((s) => s.settings);
  const setSettings = useSyncStore((s) => s.setSettings);
  // The address and key are typed, so they are applied on blur (and Enter) instead of starting a sync per keystroke.
  const [url, setUrl] = useState(settings.url);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const apply = () => setSettings({ url: url.trim(), apiKey: apiKey.trim() });
  const ready = settings.enabled && settings.url.trim().length > 0;

  return (
    <>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Sync</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Keep your projects in step across devices, through a server you run yourself.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sync-enabled" className="text-[0.9375rem]">
              Sync this device
            </Label>
            <Switch id="sync-enabled" checked={settings.enabled} onCheckedChange={(enabled) => { apply(); setSettings({ enabled }); }} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sync-url">Server address</Label>
            <Input
              id="sync-url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://sync.example.com or http://192.168.1.10:3051"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={apply}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sync-key">API key</Label>
            <Input
              id="sync-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Optional on your home network"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={apply}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
            <p className="text-[0.8125rem] text-muted-foreground">
              Only if your server has one. Without a key the server answers your local network only, so it is needed through a tunnel or the internet.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="sync-fonts" className="text-[0.9375rem]">
                Sync uploaded fonts
              </Label>
              <p className="text-[0.8125rem] text-muted-foreground">
                The font files you added go to your server only, and are never served without your key. Turn this off to keep fonts on this device.
              </p>
            </div>
            <Switch id="sync-fonts" checked={settings.syncFonts} onCheckedChange={(syncFonts) => setSettings({ syncFonts })} />
          </div>

          <StatusBlock />

          <p className="text-[0.8125rem] text-muted-foreground">
            No server yet?{' '}
            <a className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" href="/sync" target="_blank" rel="noreferrer">
              Set one up in a few minutes <ArrowSquareOutIcon className="size-3.5" />
            </a>
          </p>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button
            onClick={() => {
              apply();
              void syncNow();
            }}
            disabled={!ready || !url.trim()}
          >
            <SyncNowIcon />
            Sync now
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </ResponsiveDialogFooter>
    </>
  );
}

function SyncNowIcon() {
  const status = useSyncStore((s) => s.status);
  return <ArrowClockwiseIcon data-icon="inline-start" className={cn(status === 'syncing' && 'animate-spin')} />;
}

function StatusBlock() {
  const status = useSyncStore((s) => s.status);
  const error = useSyncStore((s) => s.error);
  const last = useSyncStore((s) => s.lastSyncedAt);
  const pending = useSyncStore((s) => s.pending);
  const conflicts = useSyncStore((s) => s.conflicts);

  let icon = <CloudSlashIcon className="size-5 shrink-0 text-muted-foreground" />;
  let title = 'Sync is off';
  if (status === 'syncing') {
    icon = <ArrowClockwiseIcon className="size-5 shrink-0 animate-spin text-muted-foreground" />;
    title = 'Syncing…';
  } else if (status === 'idle') {
    icon = <CheckCircleIcon className="size-5 shrink-0 text-primary" weight="fill" />;
    title = pending > 0 ? `${pending} ${pending === 1 ? 'change' : 'changes'} waiting to sync` : 'Up to date';
  } else if (status === 'offline') {
    icon = <CloudSlashIcon className="size-5 shrink-0 text-muted-foreground" />;
    title = 'Offline';
  } else if (status === 'error') {
    icon = <WarningCircleIcon className="size-5 shrink-0 text-destructive" weight="fill" />;
    title = 'Sync failed';
  }

  return (
    <section aria-label="Sync status" aria-live="polite" className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-[0.9375rem] font-medium">
        {icon}
        {title}
      </div>
      {error && <p className={cn('text-[0.8125rem] [overflow-wrap:anywhere]', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{error}</p>}
      {status === 'offline' && pending > 0 && (
        <p className="text-[0.8125rem] text-muted-foreground">
          {pending} {pending === 1 ? 'change is' : 'changes are'} saved on this device and will be sent when the server is reachable.
        </p>
      )}
      <p className="text-[0.8125rem] text-muted-foreground" title={last ? fullDate(last) : undefined}>
        {last ? `Last sync ${relativeDate(last)}, ${new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Never synced from this device'}
      </p>
      {conflicts > 0 && (
        <p className="text-[0.8125rem] text-muted-foreground">
          {conflicts} {conflicts === 1 ? 'project was' : 'projects were'} edited on two devices: the newer edit won and the other is kept as a “conflicted copy” in Projects.
        </p>
      )}
    </section>
  );
}
