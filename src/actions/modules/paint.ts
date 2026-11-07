import { resetPaint, swapPaint } from '@/store/usePaintDefaults';
import type { Action } from '../types';

const actions: Action[] = [
  { id: 'paint.swap', label: 'Swap fill and stroke', menu: 'object', group: 'paint', order: 200, shortcut: ['x', 'shift+x'], run: swapPaint },
  { id: 'paint.default', label: 'Default fill and stroke', menu: 'object', group: 'paint', order: 201, shortcut: 'd', run: resetPaint },
];

export default actions;
