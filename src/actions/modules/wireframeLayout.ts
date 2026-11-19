// Stacks and grids in wireframe documents (src/wireframe/layoutCommands.ts). Hidden in other documents.
import { ColumnsIcon, GridFourIcon, RowsIcon, SelectionSlashIcon } from '@phosphor-icons/react';
import type { LayoutKind } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { canChangeKind, changeKind } from '@/wireframe/containerCommands';
import { canUnwrapSelection, canWrapSelection, unwrapSelection, wrapSelection } from '@/wireframe/layoutCommands';
import type { Action } from '../types';

const notWireframe = () => !useDocStore.getState().doc.wireframe;

const actions: Action[] = [
  {
    id: 'wireframe.layout.vstack',
    label: 'Vertical stack',
    menu: 'object',
    group: 'layout',
    order: 85,
    icon: RowsIcon,
    // ⌥⇧ + V / H / G: Alt keeps them clear of the tool letters (A, V, H…) in every document.
    shortcut: 'alt+shift+v',
    get hidden() {
      return notWireframe();
    },
    enabled: canWrapSelection,
    run: () => void wrapSelection('vstack'),
  },
  {
    id: 'wireframe.layout.hstack',
    label: 'Horizontal stack',
    menu: 'object',
    group: 'layout',
    order: 85.1,
    icon: ColumnsIcon,
    shortcut: 'alt+shift+h',
    get hidden() {
      return notWireframe();
    },
    enabled: canWrapSelection,
    run: () => void wrapSelection('hstack'),
  },
  {
    id: 'wireframe.layout.grid',
    label: 'Grid',
    menu: 'object',
    group: 'layout',
    order: 85.2,
    icon: GridFourIcon,
    shortcut: 'alt+shift+g',
    get hidden() {
      return notWireframe();
    },
    enabled: canWrapSelection,
    run: () => void wrapSelection('grid'),
  },
  {
    id: 'wireframe.layout.remove',
    label: 'Remove stack',
    menu: 'object',
    group: 'layout',
    order: 85.3,
    icon: SelectionSlashIcon,
    get hidden() {
      return notWireframe();
    },
    enabled: canUnwrapSelection,
    run: unwrapSelection,
  },
  ...(
    [
      ['vstack', 'Change to vertical stack', RowsIcon],
      ['hstack', 'Change to horizontal stack', ColumnsIcon],
      ['grid', 'Change to grid', GridFourIcon],
    ] as const
  ).map(
    ([kind, label, icon], i): Action => ({
      id: `wireframe.layout.changeTo.${kind}`,
      label,
      menu: 'object',
      group: 'layout',
      order: 85.4 + i / 100,
      icon,
      get hidden() {
        return notWireframe();
      },
      enabled: () => canChangeKind(kind as LayoutKind),
      run: () => changeKind(kind as LayoutKind),
    }),
  ),
];

export default actions;
