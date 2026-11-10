import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'sync', Component: lazy(() => import('./SyncDialog').then((m) => ({ default: m.SyncDialog }))) };
export default def;
