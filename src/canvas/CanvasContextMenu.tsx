import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { firstShortcut, formatShortcut, getAction, runAction } from '@/actions/registry';
import { useEditorStore } from '@/store/useEditorStore';
import { useContextMenu } from './contextMenuStore';


type Entry = string | '-' | { label: string; items: string[] };

/** With a selection: object commands. Without: paste, select all, view. */
const OBJECT_MENU: Entry[] = [
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.duplicate',
  'edit.delete',
  '-',
  'object.group',
  'object.ungroup',
  { label: 'Arrange', items: ['object.arrange.front', 'object.arrange.forward', 'object.arrange.backward', 'object.arrange.back'] },
  { label: 'Transform', items: ['object.flipH', 'object.flipV'] },
  { label: 'Path', items: ['path.editPoints', 'path.convert', 'path.outlineStroke', 'path.join', 'path.reverse', 'path.simplify'] },
  { label: 'Boolean', items: ['path.boolean.unite', 'path.boolean.subtract', 'path.boolean.intersect', 'path.boolean.exclude'] },
  'text.createOutlines',
  '-',
  'object.lock',
  'object.hide',
  'object.reference',
  '-',
  'paint.swap',
];

const EMPTY_MENU: Entry[] = ['edit.paste', 'edit.selectAll', '-', 'edit.undo', 'edit.redo', '-', 'object.unlockAll', 'object.showAll', '-', 'view.fit', 'view.actual'];

const isEnabled = (id: string) => {
  const a = getAction(id);
  return !!a && (a.enabled?.() ?? true);
};

function Item({ id }: { id: string }) {
  const a = getAction(id);
  if (!a) return null;
  const sc = firstShortcut(a);
  const Icon = a.icon;
  return (
    <DropdownMenuItem disabled={!isEnabled(id)} onSelect={() => runAction(id)}>
      {Icon && <Icon />}
      {a.label}
      {sc && <DropdownMenuShortcut>{formatShortcut(sc)}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}

function Entries({ entries }: { entries: Entry[] }) {
  // Drop disabled-only submenus and duplicate/leading/trailing separators.
  const visible = entries.filter((e) => typeof e === 'string' || e.items.some(isEnabled));
  const cleaned = visible.filter((e, i) => e !== '-' || (i > 0 && i < visible.length - 1 && visible[i - 1] !== '-'));
  return (
    <>
      {cleaned.map((e, i) => {
        if (e === '-') return <DropdownMenuSeparator key={`sep-${i}`} />;
        if (typeof e === 'string') return <Item key={e} id={e} />;
        return (
          <DropdownMenuSub key={e.label}>
            <DropdownMenuSubTrigger>{e.label}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-48">
              {e.items.map((id) => (
                <Item key={id} id={id} />
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
    </>
  );
}

/** Canvas context menu: a dropdown anchored at the pointer. */
export function CanvasContextMenu() {
  const at = useContextMenu((s) => s.at);
  const set = useContextMenu((s) => s.set);
  const hasSelection = useEditorStore((s) => s.selection.length > 0);
  return (
    <DropdownMenu open={!!at} onOpenChange={(o) => !o && set(null)} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="pointer-events-none fixed size-0" style={{ left: at?.x ?? 0, top: at?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={2} className="min-w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        {at && <Entries entries={hasSelection ? OBJECT_MENU : EMPTY_MENU} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
