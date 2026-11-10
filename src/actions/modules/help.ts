import { useEditorStore } from '@/store/useEditorStore';
import type { Action } from '../types';

const actions: Action[] = [
  {
    id: 'help.shortcuts',
    label: 'Keyboard shortcuts',
    menu: 'help',
    group: 'help',
    order: 0,
    shortcut: 'mod+/',
    run: () => useEditorStore.getState().openDialog('shortcuts'),
  },
  {
    id: 'help.cli',
    label: 'CLI & agents…',
    menu: 'help',
    group: 'help',
    order: 5,
    run: () => useEditorStore.getState().openDialog('cli'),
  },
  {
    id: 'help.about',
    label: 'About Designer',
    menu: 'help',
    group: 'about',
    order: 10,
    run: () => useEditorStore.getState().openDialog('about'),
  },
];

export default actions;
