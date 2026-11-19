// Note commands (see src/wireframe/notes.ts). Hidden in documents that are not wireframes.
import { NoteIcon } from '@phosphor-icons/react';
import { useDocStore } from '@/store/useDocStore';
import { addNoteToSelection, selectedNoteTarget } from '@/wireframe/noteCommands';
import type { Action } from '../types';

const actions: Action[] = [
  {
    id: 'wireframe.addNote',
    label: 'Add note',
    menu: 'object',
    group: 'screen',
    order: 85,
    icon: NoteIcon,
    get hidden() {
      return !useDocStore.getState().doc.wireframe;
    },
    enabled: () => selectedNoteTarget() !== null,
    run: () => void addNoteToSelection(),
  },
];

export default actions;
