import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'openLink', Component: lazy(() => import('./OpenLinkDialog').then((m) => ({ default: m.OpenLinkDialog }))) };
export default def;
