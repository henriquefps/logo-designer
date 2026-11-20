import { ArrowSquareOutIcon, SparkleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { formatShortcut, runAction } from '@/actions/registry';
import { cn } from '@/lib/utils';
import { usePresence, useAgentStore } from '../agentStore';
import { agentName, presenceLabel, type Presence } from '../jobs';
import { useJobRows } from './useJobRows';

const SYNC_GUIDE = 'https://designer.hfps.dev/sync';

function explain(p: Presence): string {
  switch (p.kind) {
    case 'no-sync':
      return 'The AI agent is your own Claude Code, reached through your sync server: turn Sync on to use it.';
    case 'unsupported':
      return 'Your sync server does not know about agent jobs yet. Update designer-sync to 0.3.0 or later.';
    case 'unreachable':
      return `The sync server cannot be reached right now (${p.message}).`;
    case 'checking':
      return 'Looking for an agent on your sync server…';
    case 'offline':
      return 'No agent is online. On your machine, run designer agent with the sync server’s address and key; it shows up here within a few seconds.';
    case 'online':
      return `Claude Code on ${p.agent.host || agentName(p.agent)} is ready${p.agent.version ? ` (designer agent ${p.agent.version})` : ''}.${p.count > 1 ? ` ${p.count} agents online.` : ''}`;
    case 'busy':
      return `Claude Code on ${p.agent.host || agentName(p.agent)} is working on a job; new jobs wait until it is free.`;
  }
}

/** "AI agent" status for wireframe documents (status bar; `compact` = an icon for the phone top bar). */
export function AgentStatus({ compact = false }: { compact?: boolean }) {
  const wireframe = useDocStore((s) => !!s.doc.wireframe);
  const presence = usePresence();
  const rows = useJobRows();
  const panelOpen = useAgentStore((s) => s.panelOpen);
  if (!wireframe) return null;
  const running = rows.filter((r) => r.status === 'running' || r.status === 'queued').length;
  const label = presenceLabel(presence);
  const on = presence.kind === 'online' || presence.kind === 'busy';
  const dot = (
    <span className="relative flex size-2" aria-hidden="true">
      {presence.kind === 'busy' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />}
      <span className={cn('relative inline-flex size-2 rounded-full', on ? 'bg-primary' : 'bg-muted-foreground/40')} />
    </span>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon" aria-label={label} data-testid="agent-status" data-presence={presence.kind}>
            <span className="relative">
              <SparkleIcon />
              <span className="absolute -right-0.5 -bottom-0.5">{dot}</span>
            </span>
          </Button>
        ) : (
          <button type="button" className="flex items-center gap-1.5 rounded-sm px-1 hover:text-foreground" data-testid="agent-status" data-presence={presence.kind} aria-label={label}>
            {dot}
            <span>{label}</span>
            {running > 0 && <span className="text-foreground">· {running === 1 ? '1 job' : `${running} jobs`}</span>}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="gap-3">
        <div className="flex items-center gap-2 font-medium">
          <SparkleIcon className="size-4" /> AI agent
        </div>
        <p className="text-muted-foreground" data-testid="agent-status-text">
          {explain(presence)}
        </p>
        {presence.kind === 'offline' && (
          <pre className="overflow-x-auto rounded-md bg-muted px-2 py-1.5 text-xs">designer agent --server &lt;sync address&gt;</pre>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {presence.kind === 'no-sync' && (
            <>
              <Button size="sm" variant="ghost" asChild>
                <a href={SYNC_GUIDE} target="_blank" rel="noreferrer">
                  Setup guide <ArrowSquareOutIcon data-icon="inline-end" />
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={() => useEditorStore.getState().openDialog('sync')}>
                Sync…
              </Button>
            </>
          )}
          {rows.length > 0 && !panelOpen && (
            <Button size="sm" variant="outline" onClick={() => useAgentStore.getState().setPanelOpen(true)}>
              Show jobs
            </Button>
          )}
          {on && (
            <Button size="sm" variant="outline" onClick={() => runAction('agent.ask')}>
              Ask the agent… <span className="text-muted-foreground">{formatShortcut('mod+k')}</span>
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
