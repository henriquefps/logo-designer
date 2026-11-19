import { PlusIcon } from '@phosphor-icons/react';
import { platformDef, SCREEN_PLATFORMS, screenNodes } from '@/model';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/useEditorStore';
import { addScreenCommand } from '@/wireframe/commands';
import { Section } from '../../../shared/Section';
import { GridSection } from '../artboard/ArtboardSection';
import type { SelectionContext } from '../../types';

export function WireframeSection({ ctx }: { ctx: SelectionContext }) {
  const frames = screenNodes(ctx.doc);
  const screens = ctx.doc.wireframe?.screens ?? [];
  return (
    <>
      <Section title="Screens">
        {screens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No screens yet. Add one below, or press F and click on the canvas.</p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Logical screens">
            {screens.map((s) => (
              <li key={s.id} className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                {frames
                  .filter((f) => f.screen.screenId === s.id)
                  .map((f) => (
                    <Button
                      key={f.id}
                      size="xs"
                      variant="outline"
                      onClick={() => useEditorStore.getState().setSelection([f.id])}
                      title={`Select the ${platformDef(f.screen.platform).label.toLowerCase()} frame`}
                    >
                      {platformDef(f.screen.platform).label}
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-3 gap-2">
          {SCREEN_PLATFORMS.map((p) => (
            <Button key={p.id} size="sm" variant="outline" onClick={() => addScreenCommand(p.id)}>
              <PlusIcon data-icon="inline-start" />
              {p.label}
            </Button>
          ))}
        </div>
      </Section>
      <GridSection />
    </>
  );
}
