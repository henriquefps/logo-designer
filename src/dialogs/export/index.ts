import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'export', Component: lazy(() => import('./ExportDialog').then((m) => ({ default: m.ExportDialog }))) };
export default def;
