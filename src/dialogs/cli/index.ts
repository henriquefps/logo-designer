import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'cli', Component: lazy(() => import('./CliDialog').then((m) => ({ default: m.CliDialog }))) };
export default def;
