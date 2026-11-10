import { lazy } from 'react';
import type { DialogDef } from '../types';

const def: DialogDef = { id: 'exportIcon', Component: lazy(() => import('./ExportIconDialog').then((m) => ({ default: m.ExportIconDialog }))) };
export default def;
