import { ArrowRightIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addFlowCommand, removeFlowCommand, selectFlow } from '@/wireframe/flowCommands';
import { flowsFrom } from '@/wireframe/flows';
import { frameOf, logicalScreen } from '@/wireframe/screens';
import { Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

export function FlowsSection({ ctx }: { ctx: SelectionContext }) {
  const id = ctx.ids[0];
  const flows = flowsFrom(ctx.doc, id);
  const own = frameOf(ctx.doc, id)?.screen.screenId;
  const linked = new Set(flows.map((f) => f.to));
  const options = (ctx.doc.wireframe?.screens ?? []).filter((s) => s.id !== own && !linked.has(s.id));
  return (
    <Section title="Flows">
      {flows.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Outgoing flows">
          {flows.map((f) => (
            <li key={f.id} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted"
                title="Select the arrow"
                onClick={() => selectFlow(f.id)}
              >
                <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{logicalScreen(ctx.doc, f.to)?.name ?? 'Missing screen'}</span>
                {f.label && <span className="truncate text-xs text-muted-foreground">“{f.label}”</span>}
              </button>
              <Button size="icon-sm" variant="ghost" className="size-7" aria-label={`Remove flow to ${logicalScreen(ctx.doc, f.to)?.name ?? 'screen'}`} onClick={() => removeFlowCommand(f.id)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Drag the handle on the right of the element to a screen, or onto empty canvas to create one.</p>
      )}
      {options.length > 0 && (
        <Select value="" onValueChange={(to) => addFlowCommand(id, to)}>
          <SelectTrigger size="sm" className="w-full" aria-label="Link to screen">
            <SelectValue placeholder="Link to screen…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Section>
  );
}
