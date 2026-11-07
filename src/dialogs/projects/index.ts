import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'projects', Component: lazy(() => import('./ProjectsDialog').then((m) => ({ default: m.ProjectsDialog }))) };
export default def;
