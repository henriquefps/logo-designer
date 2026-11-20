import { CopySimpleIcon, SparkleIcon } from '@phosphor-icons/react';
import { isScreenNode, platformDef, SCREEN_PLATFORMS, type ScreenNode, type ScreenPlatform, type ScreenStatus } from '@/model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDocStore } from '@/store/useDocStore';
import { duplicateSelectedScreenAs, setScreenPlatform } from '@/wireframe/commands';
import { freePlatforms } from '@/wireframe/screens';
import { SCREEN_STATUSES, STATUS_LABELS, screenStatus } from '@/wireframe/flows';
import { setScreenStatusCommand } from '@/wireframe/flowCommands';
import { usePresence } from '@/agent/agentStore';
import { openAgentDialog } from '@/agent/commands';
import { availability } from '@/agent/jobs';
import { WhyDisabled } from '@/agent/ui/Unavailable';
import { NumberField } from '../../../shared/NumberField';
import { FieldRow, Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

export function ScreenSection({ ctx }: { ctx: SelectionContext }) {
  const frame = ctx.nodes[0];
  if (!isScreenNode(frame)) return null;
  return <ScreenFields ctx={ctx} frame={frame} />;
}

function ScreenFields({ ctx, frame }: { ctx: SelectionContext; frame: ScreenNode }) {
  const { screen } = frame;
  const def = platformDef(screen.platform);
  const free = freePlatforms(ctx.doc, screen.screenId);
  const variants = ctx.doc.children.filter((n) => isScreenNode(n) && n.screen.screenId === screen.screenId).length;
  const ds = useDocStore.getState();
  const ai = availability(usePresence(), { wireframe: true });
  const rename = (name: string) => {
    if (name.trim() && name.trim() !== frame.name) ds.updateNode(frame.id, { name: name.trim() }, { label: 'Rename screen' });
  };
  return (
    <Section title="Screen">
      <FieldRow label="Name">
        <Input
          key={frame.name}
          className="h-8"
          aria-label="Screen name"
          defaultValue={frame.name}
          onBlur={(e) => rename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </FieldRow>
      <FieldRow label="Platform">
        <Select value={screen.platform} onValueChange={(p) => setScreenPlatform(frame.id, p as ScreenPlatform)}>
          <SelectTrigger size="sm" className="w-full" aria-label="Platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCREEN_PLATFORMS.map((p) => (
              <SelectItem key={p.id} value={p.id} disabled={p.id !== screen.platform && !free.includes(p.id)}>
                {p.label} · {p.width}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Status">
        <Select value={screenStatus(ctx.doc, screen.screenId) ?? 'none'} onValueChange={(v) => setScreenStatusCommand(frame.id, v === 'none' ? null : (v as ScreenStatus))}>
          <SelectTrigger size="sm" className="w-full" aria-label="Screen status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not stated</SelectItem>
            {SCREEN_STATUSES.map((st) => (
              <SelectItem key={st} value={st}>
                {STATUS_LABELS[st]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Width">
        <NumberField
          ariaLabel="Screen width"
          value={screen.width}
          min={1}
          max={16384}
          precision={0}
          suffix="px"
          onCommit={(w) =>
            ds.updateNodes(
              [frame.id],
              (n) => {
                if (n.type === 'group' && n.screen) n.screen.width = w;
              },
              { label: 'Screen width' },
            )
          }
        />
      </FieldRow>
      <FieldRow label="Height">
        <span className="text-sm tabular-nums">{Math.round(screen.height)} px</span>
      </FieldRow>
      <p className="text-xs text-muted-foreground">
        The height grows with the content, never below {def.minHeight} px. {variants > 1 ? `This screen has ${variants} variants.` : 'Variants for other platforms:'}
      </p>
      {free.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {free.map((p) => (
            <Button key={p} size="sm" variant="outline" onClick={() => duplicateSelectedScreenAs(p)}>
              <CopySimpleIcon data-icon="inline-start" />
              Duplicate as {platformDef(p).label.toLowerCase()}
            </Button>
          ))}
          {free.map((p) => (
            <WhyDisabled key={`ai-${p}`} reason={ai.ok ? null : ai.reason}>
              <Button size="sm" variant="outline" disabled={!ai.ok} onClick={() => openAgentDialog({ kind: 'adapt', frameId: frame.id, to: p })}>
                <SparkleIcon data-icon="inline-start" />
                Adapt to {platformDef(p).label.toLowerCase()} with AI
              </Button>
            </WhyDisabled>
          ))}
        </div>
      )}
    </Section>
  );
}
