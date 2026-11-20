import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'sharedComponent', Component: lazy(() => import('./SharedComponentDialog').then((m) => ({ default: m.SharedComponentDialog }))) };
export default def;
