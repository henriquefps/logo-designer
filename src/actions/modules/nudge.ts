import type { Id, Vec } from '@/model';
import { editableSelection, translateNodes } from '../selection';
import type { Action } from '../types';

const nudge = (dx: number, dy: number) => () => {
  const ids = editableSelection();
  if (!ids.length) return;
  translateNodes(new Map<Id, Vec>(ids.map((id) => [id, { x: dx, y: dy }])), 'Nudge');
};

const dirs = [
  ['left', -1, 0],
  ['right', 1, 0],
  ['up', 0, -1],
  ['down', 0, 1],
] as const;

const actions: Action[] = dirs.flatMap(([name, x, y]): Action[] => [
  { id: `nudge.${name}`, label: `Nudge ${name}`, hidden: true, section: 'Edit', shortcut: `arrow${name}`, run: nudge(x, y) },
  {
    id: `nudge.${name}10`,
    label: `Nudge ${name} ×10`,
    hidden: true,
    section: 'Edit',
    shortcut: `shift+arrow${name}`,
    run: nudge(x * 10, y * 10),
  },
]);

export default actions;
