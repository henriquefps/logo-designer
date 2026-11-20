import { useEffect, useState } from 'react';
import { ArrowRightIcon, PlusIcon, SparkleIcon, SquareIcon, StackIcon, TrashIcon } from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDocStore } from '@/store/useDocStore';
import { useView } from '@/canvas/overlays/useView';
import { bezierAt, flowCurve, flowSourceLabel } from '../flows';
import { logicalScreen } from '../screens';
import { canvasOrigin } from './arrowHead';
import { addFlowCommand, newScreenFromFlowCommand, removeFlowCommand, selectFlow, setFlowLabelCommand, sharedScope, useFlowStore } from '../flowCommands';

/**
 * A flow dropped on empty canvas: New screen (there, named after the source or its part) or Generate with AI (later).
 * From inside a shared component's instance it also says where the link applies; dropped on a screen from there, it
 * only asks that ("This screen only" / "Every screen using Tab bar"). Escape closes it.
 */
export function FlowDropMenu() {
  const menu = useFlowStore((s) => s.menu);
  const setMenu = useFlowStore((s) => s.setMenu);
  const doc = useDocStore((s) => s.doc);
  const [scope, setScope] = useState<'one' | 'all'>('all');
  const origin = menu ? canvasOrigin() : { x: 0, y: 0 };
  const name = menu ? flowSourceLabel(doc, menu.fromId, menu.part) : '';
  const shared = menu ? sharedScope(menu.fromId) : null;
  const part = menu?.part !== undefined ? { part: menu.part } : {};
  const short = (t: string) => (t.length > 24 ? `${t.slice(0, 23)}…` : t);
  const target = menu?.to ? (logicalScreen(doc, menu.to)?.name ?? 'screen') : '';
  return (
    <DropdownMenu open={!!menu} onOpenChange={(o) => !o && setMenu(null)} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="pointer-events-none fixed size-0" style={{ left: origin.x + (menu?.screen.x ?? 0), top: origin.y + (menu?.screen.y ?? 0) }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-72" onCloseAutoFocus={(e) => e.preventDefault()} data-slot="flow-drop-menu">
        {menu?.to && shared ? (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              “{short(name || 'element')}” → {short(target)}: link it on…
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                addFlowCommand(menu.fromId, menu.to!, { ...part, shared: false });
                setMenu(null);
              }}
            >
              <SquareIcon />
              This screen only
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                addFlowCommand(menu.fromId, menu.to!, { ...part, shared: true });
                setMenu(null);
              }}
            >
              <StackIcon />
              Every screen using “{short(shared.name)}”
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Flow from “{name || 'element'}”</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                if (menu) newScreenFromFlowCommand(menu.fromId, menu.point, { ...part, ...(shared ? { shared: scope === 'all' } : {}) });
                setMenu(null);
              }}
            >
              <PlusIcon />
              New screen{name ? ` “${short(name)}”` : ''}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <SparkleIcon />
              Generate with AI
              <span className="ml-auto pl-4 text-xs whitespace-nowrap text-muted-foreground">Coming later</span>
            </DropdownMenuItem>
            {shared && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Link it on</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as 'one' | 'all')}>
                  <DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
                    Every screen using “{short(shared.name)}”
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="one" onSelect={(e) => e.preventDefault()}>
                    This screen only
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The selected arrow's editor, at its middle: label and delete (Delete / Backspace also delete, Escape deselects). */
export function FlowEditor() {
  const selected = useFlowStore((s) => s.selected);
  const doc = useDocStore((s) => s.doc);
  const { toScreen } = useView();
  const flow = selected ? doc.wireframe?.flows?.find((f) => f.id === selected) : undefined;
  // The flow went away (undo, its source deleted): drop the selection.
  useEffect(() => {
    if (selected && !flow) selectFlow(null);
  }, [selected, flow]);
  if (!flow) return null;
  const c = flowCurve(doc, flow);
  if (!c) return null;
  const mid = toScreen(bezierAt(c.points, 0.5));
  const origin = canvasOrigin();
  const target = logicalScreen(doc, flow.to)?.name ?? 'screen';
  return (
    <div
      data-slot="flow-editor"
      className="fixed z-40 flex w-64 items-center gap-1.5 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-md"
      style={{ left: origin.x + mid.x - 128, top: origin.y + mid.y + 18 }}
    >
      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-label={`To ${target}`} />
      <Input
        key={`${flow.id}:${flow.label ?? ''}`}
        className="h-7 text-xs"
        aria-label="Flow label"
        placeholder={`Label (to ${target})`}
        defaultValue={flow.label ?? ''}
        onBlur={(e) => setFlowLabelCommand(flow.id, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.currentTarget.value = flow.label ?? '';
            e.currentTarget.blur();
          }
        }}
      />
      {flow.symbol && (
        <span className="shrink-0 text-xs text-muted-foreground" title={`Defined in “${doc.wireframe?.symbols?.find((x) => x.id === flow.symbol)?.name ?? 'the shared component'}”: every screen using it`}>
          <StackIcon className="inline size-3.5" /> All
        </span>
      )}
      <Button size="icon-sm" variant="ghost" className="size-7" aria-label="Delete flow" title="Delete flow (Delete)" onClick={() => removeFlowCommand(flow.id)}>
        <TrashIcon />
      </Button>
    </div>
  );
}
