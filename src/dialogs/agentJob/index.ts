import type { DialogDef } from '../types';
import { lazy } from 'react';

const def: DialogDef = { id: 'agentJob', Component: lazy(() => import('./AgentJobDialog').then((m) => ({ default: m.AgentJobDialog }))) };
export default def;
