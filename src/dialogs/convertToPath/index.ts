import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'convertToPath', Component: lazy(() => import('./ConvertToPathDialog').then((m) => ({ default: m.ConvertToPathDialog }))) };
export default def;
