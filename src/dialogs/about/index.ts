import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'about', Component: lazy(() => import('./AboutDialog').then((m) => ({ default: m.AboutDialog }))) };
export default def;
