import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'samples', Component: lazy(() => import('./SamplesDialog').then((m) => ({ default: m.SamplesDialog }))) };
export default def;
