// Stacks and grids in wireframe documents (src/wireframe/layoutCommands.ts). Hidden in other documents.
import { ColumnsIcon, GridFourIcon, RowsIcon, SelectionSlashIcon } from '@phosphor-icons/react';
import { useDocStore } from '@/store/useDocStore';
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
];

export default actions;
