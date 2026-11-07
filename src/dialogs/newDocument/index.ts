import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'newDocument', Component: lazy(() => import('./NewDocumentDialog').then((m) => ({ default: m.NewDocumentDialog }))) };
export default def;
