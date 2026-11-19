import { RowsIcon, SelectionSlashIcon } from '@phosphor-icons/react';
import type { LayoutAlign, LayoutKind } from '@/model';
import { isMac } from '@/actions/registry';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setLayout, unwrapSelection, wrapSelection } from '@/wireframe/layoutCommands';
import { NumberField } from '../../../shared/NumberField';
import { FieldRow, Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

const KINDS: { id: LayoutKind; label: string }[] = [
  { id: 'vstack', label: 'Vertical stack' },
  { id: 'hstack', label: 'Horizontal stack' },
  { id: 'grid', label: 'Grid' },
];
const ALIGN: { id: LayoutAlign; label: string }[] = [
  { id: 'start', label: 'Start' },
  { id: 'center', label: 'Center' },
  { id: 'end', label: 'End' },
  { id: 'stretch', label: 'Stretch' },
];

export function LayoutSection({ ctx }: { ctx: SelectionContext }) {
  const node = ctx.nodes[0];
  if (node.type !== 'group') return null;
  const layout = node.layout;
  const isFrame = !!node.screen;
  if (!layout) {
    return (
      <Section title="Layout">
        <p className="text-xs text-muted-foreground">The content of this screen is free: objects stay where you put them.</p>
        <Button size="sm" variant="outline" onClick={() => wrapSelection('vstack')}>
          <RowsIcon data-icon="inline-start" />
          Use a vertical stack
        </Button>
      </Section>
    );
  }
  const ids = [node.id];
  return (
    <Section
      title={isFrame ? 'Screen layout' : 'Layout'}
      actions={
        <Button size="icon" variant="ghost" className="size-7" aria-label={isFrame ? 'Make the content free' : 'Remove stack'} title={isFrame ? 'Make the content free' : 'Remove stack'} onClick={unwrapSelection}>
          <SelectionSlashIcon />
        </Button>
      }
    >
      <FieldRow label="Kind">
        <Select value={layout.kind} onValueChange={(k) => setLayout(ids, { kind: k as LayoutKind }, 'Layout kind')}>
          <SelectTrigger size="sm" className="w-full" aria-label="Layout kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      {layout.kind === 'grid' && (
        <FieldRow label="Columns">
          <NumberField ariaLabel="Columns" value={layout.columns ?? 2} min={1} max={24} precision={0} onCommit={(v) => setLayout(ids, { columns: v }, 'Grid columns')} undoLabel="Grid columns" />
        </FieldRow>
      )}
      <FieldRow label="Gap">
        <NumberField ariaLabel="Gap" value={layout.gap} min={0} max={1000} precision={0} suffix="px" onCommit={(v) => setLayout(ids, { gap: v }, 'Gap')} undoLabel="Gap" />
      </FieldRow>
      <FieldRow label="Padding">
        <NumberField ariaLabel="Padding" value={layout.padding} min={0} max={1000} precision={0} suffix="px" onCommit={(v) => setLayout(ids, { padding: v }, 'Padding')} undoLabel="Padding" />
      </FieldRow>
      <FieldRow label="Align">
        <Select value={layout.align} onValueChange={(a) => setLayout(ids, { align: a as LayoutAlign }, 'Align')}>
          <SelectTrigger size="sm" className="w-full" aria-label="Align children">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALIGN.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <p className="text-xs text-muted-foreground">
        Drag a child to reorder it. Hold {isMac ? '⌘' : 'Ctrl'} while dropping to take it out of the stack (free).
      </p>
    </Section>
  );
}
