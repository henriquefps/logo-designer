import { DiamondsFourIcon, LinkBreakIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { locate } from '@/model';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/useEditorStore';
import { detachSymbolSelected, startMakeComponent, startRenameSymbol } from '@/wireframe/symbolCommands';
import { getSymbol, instancesOf, makeComponentProblem, sharedOwner, slotsOf } from '@/wireframe/symbols';
import { Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

export function SymbolSection({ ctx }: { ctx: SelectionContext }) {
  const n = ctx.nodes[0];
  const loc = locate(ctx.doc, n.id);
  // The instance itself, or the innermost instance around the selected object.
  const owner = n.type === 'group' && n.symbol ? n : [...(loc?.ancestors ?? [])].reverse().find((a) => a.type === 'group' && a.symbol);
  const s = owner?.type === 'group' && owner.symbol ? getSymbol(ctx.doc, owner.symbol.id) : null;
  if (!s || !owner) {
    if (makeComponentProblem(n, loc?.ancestors)) return null;
    return (
      <Section title="Shared component">
        <Button size="sm" variant="outline" className="w-full" onClick={() => startMakeComponent()}>
          <DiamondsFourIcon /> Make component…
        </Button>
        <p className="text-xs text-muted-foreground">Reuse this on other screens: every copy stays in sync.</p>
      </Section>
    );
  }
  const copies = instancesOf(ctx.doc, s.id).length;
  const inside = owner !== n;
  // In one of the instance's slots: this instance's own content, not part of the shared component.
  const own = inside && !sharedOwner(loc?.ancestors ?? []);
  const slots = owner.type === 'group' ? slotsOf(owner) : [];
  return (
    <Section title="Shared component">
      <div className="flex min-w-0 items-center gap-2">
        <DiamondsFourIcon className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{copies === 1 ? '1 instance' : `${copies} instances`}</span>
      </div>
      {inside ? (
        <>
          <p className="text-xs text-muted-foreground">
            {own ? `In the content of this “${s.name}”: it belongs to this instance only.` : `Part of “${s.name}”: changes here go to every instance (text stays on this one).`}
          </p>
          <Button size="sm" variant="outline" onClick={() => useEditorStore.getState().setSelection([owner.id])}>
            Select the component
          </Button>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => startRenameSymbol(s.id)}>
              <PencilSimpleIcon /> Rename
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => detachSymbolSelected()}>
              <LinkBreakIcon /> Detach
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Double-click to edit the content: every instance follows. Position and size are this instance’s own.</p>
          {slots.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {slots.length === 1 ? `“${slots[0].name}” holds` : `${slots.map((x) => `“${x.name}”`).join(', ')} hold`} content per instance: drop elements there.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
