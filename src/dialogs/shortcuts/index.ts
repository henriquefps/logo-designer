import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'shortcuts', Component: lazy(() => import('./ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog }))) };
export default def;
