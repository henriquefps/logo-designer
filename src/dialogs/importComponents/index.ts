import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'importComponents', Component: lazy(() => import('./ImportComponentsDialog').then((m) => ({ default: m.ImportComponentsDialog }))) };
export default def;
