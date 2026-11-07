import { Fragment } from 'react';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { firstShortcut, formatShortcut, menuGroups, MENUS } from '@/actions/registry';
import type { Action, MenuId } from '@/actions/types';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';

/** Re-render menus when the document/selection changes so enabled/checked states are fresh. */
function useMenuState() {
  useDocStore((s) => s.version);
  useDocStore((s) => s.past.length + s.future.length);
  useEditorStore((s) => s.selection);
  useEditorStore((s) => s.snapping);
  useEditorStore((s) => s.showRulers);
  useEditorStore((s) => s.showGrid);
  useEditorStore((s) => s.snapToGrid);
}

/** Splits a group into plain items and submenus (by Action.submenu), keeping order. */
function chunk(group: Action[]) {
  const out: (Action | { submenu: string; items: Action[] })[] = [];
  for (const a of group) {
    if (!a.submenu) out.push(a);
    else {
      const existing = out.find((x): x is { submenu: string; items: Action[] } => 'submenu' in x && x.submenu === a.submenu && !('id' in x));
      if (existing) existing.items.push(a);
      else out.push({ submenu: a.submenu, items: [a] });
    }
  }
  return out;
}

function MenuItemFor({ a }: { a: Action }) {
  const sc = firstShortcut(a);
  const enabled = a.enabled?.() ?? true;
  if (a.checked) {
    return (
      <MenubarCheckboxItem checked={a.checked()} disabled={!enabled} onSelect={() => a.run()}>
        {a.label}
        {sc && <MenubarShortcut>{formatShortcut(sc)}</MenubarShortcut>}
      </MenubarCheckboxItem>
    );
  }
  return (
    <MenubarItem disabled={!enabled} onSelect={() => a.run()}>
      {a.label}
      {sc && <MenubarShortcut>{formatShortcut(sc)}</MenubarShortcut>}
    </MenubarItem>
  );
}

function MenuContentFor({ menu }: { menu: MenuId }) {
  useMenuState();
  return (
    <MenubarContent className="min-w-56">
      {menuGroups(menu).map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <MenubarSeparator />}
          {chunk(group).map((item) =>
            'id' in item ? (
              <MenuItemFor key={item.id} a={item} />
            ) : (
              <MenubarSub key={item.submenu}>
                <MenubarSubTrigger>{item.submenu}</MenubarSubTrigger>
                <MenubarSubContent className="min-w-52">
                  {item.items.map((a) => (
                    <MenuItemFor key={a.id} a={a} />
                  ))}
                </MenubarSubContent>
              </MenubarSub>
            ),
          )}
        </Fragment>
      ))}
    </MenubarContent>
  );
}

/** Desktop menu bar built from the action registry (src/actions/modules). Menus without actions are hidden. */
export function MenuBar() {
  return (
    <Menubar className="h-9 border-none bg-transparent p-0 shadow-none">
      {MENUS.filter((m) => menuGroups(m.id).length > 0).map((m) => (
        <MenubarMenu key={m.id}>
          <MenubarTrigger>{m.label}</MenubarTrigger>
          <MenuContentFor menu={m.id} />
        </MenubarMenu>
      ))}
    </Menubar>
  );
}

/** The same menus as nested dropdown items (mobile "more" menu). */
export function MenuDropdownItems() {
  useMenuState();
  return (
    <>
      {MENUS.filter((m) => menuGroups(m.id).length > 0).map((m) => (
        <DropdownMenuSub key={m.id}>
          <DropdownMenuSubTrigger>{m.label}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-52">
            <DropdownMenuLabel>{m.label}</DropdownMenuLabel>
            {menuGroups(m.id).map((group, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <DropdownMenuSeparator />}
                {group.map((a) => {
                  const enabled = a.enabled?.() ?? true;
                  const label = a.submenu ? `${a.label}` : a.label;
                  return a.checked ? (
                    <DropdownMenuCheckboxItem key={a.id} checked={a.checked()} disabled={!enabled} onSelect={() => a.run()}>
                      {label}
                    </DropdownMenuCheckboxItem>
                  ) : (
                    <DropdownMenuItem key={a.id} disabled={!enabled} onSelect={() => a.run()}>
                      {label}
                    </DropdownMenuItem>
                  );
                })}
              </Fragment>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  );
}
