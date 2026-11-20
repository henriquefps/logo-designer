import { useState } from 'react';
import { ArrowRightIcon, StackIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addFlowCommand, removeFlowCommand, selectFlow } from '@/wireframe/flowCommands';
import { flowsAt, masterRef, partsOfId } from '@/wireframe/flows';
import { frameOf, logicalScreen } from '@/wireframe/screens';
import { getSymbol } from '@/wireframe/symbols';
import { FieldRow, Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

const WHOLE = '__whole';

/**
 * Outgoing flows of the selected element, per part for components with parts ("Files → Files"), the ones defined in
 * a shared component's master marked as such; and a way to add one without dragging (works on a phone): from which
 * part, on this screen only or on every screen using the shared component, to which screen.
 */
export function FlowsSection({ ctx }: { ctx: SelectionContext }) {
  const id = ctx.ids[0];
  const doc = ctx.doc;
  const flows = flowsAt(doc, id);
  const parts = partsOfId(doc, id);
  const ref = masterRef(doc, id);
  const shared = ref ? getSymbol(doc, ref.symbol) : null;
  const [part, setPart] = useState<string>(WHOLE);
  const [scope, setScope] = useState<'all' | 'one'>('all');
  const from = parts.some((p) => p.key === part) ? part : WHOLE;
  const own = frameOf(doc, id)?.screen.screenId;
  const order = new Map(parts.map((p, i) => [p.key, i]));
  const rows = [...flows].sort((a, b) => (a.part === undefined ? -1 : (order.get(a.part) ?? 99)) - (b.part === undefined ? -1 : (order.get(b.part) ?? 99)));
  const wantShared = !!shared && scope === 'all';
  const linked = new Set(flows.filter((f) => (f.part ?? WHOLE) === from && !!f.symbol === wantShared).map((f) => f.to));
  const options = (doc.wireframe?.screens ?? []).filter((s) => (s.id !== own || from !== WHOLE) && !linked.has(s.id));
  const partLabel = (key: string | undefined) => (key === undefined ? null : (parts.find((p) => p.key === key)?.label ?? key));
  const screen = (to: string) => logicalScreen(doc, to)?.name ?? 'Missing screen';
  return (
    <Section title="Flows">
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Outgoing flows">
          {rows.map((f) => (
            <li key={f.id} className="flex min-w-0 items-center gap-1" data-flow-part={f.part}>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted"
                title={f.symbol ? `Select the arrow (defined in “${getSymbol(doc, f.symbol)?.name ?? 'the shared component'}”: every screen using it)` : 'Select the arrow'}
                onClick={() => selectFlow(f.id)}
              >
                {partLabel(f.part) !== null && <span className="max-w-[45%] shrink-0 truncate font-medium">{partLabel(f.part)}</span>}
                <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{screen(f.to)}</span>
                {f.label && <span className="truncate text-xs text-muted-foreground">“{f.label}”</span>}
                {f.symbol && <StackIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-label="On every screen using the shared component" />}
              </button>
              <Button size="icon-sm" variant="ghost" className="size-7" aria-label={`Remove flow ${partLabel(f.part) ? `from ${partLabel(f.part)} ` : ''}to ${screen(f.to)}`} onClick={() => removeFlowCommand(f.id)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {parts.length
            ? 'Point at a part (a tab, a button) and drag its handle to a screen, or onto empty canvas to create one. The handle on the right links the whole element.'
            : 'Drag the handle on the right of the element to a screen, or onto empty canvas to create one.'}
        </p>
      )}
      {parts.length > 0 && (
        <FieldRow label="From">
          <Select value={from} onValueChange={setPart}>
            <SelectTrigger size="sm" className="w-full" aria-label="Link from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHOLE}>The whole element</SelectItem>
              {parts.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      )}
      {shared && (
        <FieldRow label="On">
          <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'one')}>
            <SelectTrigger size="sm" className="w-full" aria-label="Link on">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every screen using “{shared.name}”</SelectItem>
              <SelectItem value="one">This screen only</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      )}
      {options.length > 0 && (
        <Select value="" onValueChange={(to) => addFlowCommand(id, to, { ...(from !== WHOLE ? { part: from } : {}), ...(shared ? { shared: scope === 'all' } : {}) })}>
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
