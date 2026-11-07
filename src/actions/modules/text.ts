import { outlineSelection, hasSelectedText } from '@/fonts/outlineSelection';
import { useEditorStore } from '@/store/useEditorStore';
import type { Action } from '../types';

/** Text menu (and the Object-menu twin of Create outlines). */
const actions: Action[] = [
  {
    id: 'text.createOutlines',
    label: 'Create outlines',
    menu: 'object',
    group: 'outlines',
    order: 40,
    shortcut: 'mod+shift+o',
    enabled: hasSelectedText,
    run: () => void outlineSelection(),
  },
  {
    id: 'text.createOutlinesText',
    label: 'Create outlines',
    menu: 'text',
    group: 'outlines',
    order: 10,
    section: 'Text',
    enabled: hasSelectedText,
    run: () => void outlineSelection(),
  },
  {
    id: 'text.fonts',
    label: 'Fonts…',
    menu: 'text',
    group: 'fonts',
    order: 20,
    run: () => {
      const ed = useEditorStore.getState();
      ed.setPanelTab('assets');
      ed.setMobilePanelOpen(true);
    },
  },
];

export default actions;
