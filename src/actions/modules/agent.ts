// "Ask the agent…" (docs/wireframe-mode.md → Phase 4 → The app): a free request about the whole project, sent to
// your own Claude Code through the sync server. Wireframe documents only. It stays enabled so the shortcut always
// answers: the dialog says why it cannot send (no sync server, no agent online) and its Send button is disabled.
import { SparkleIcon } from '@phosphor-icons/react';
import { useDocStore } from '@/store/useDocStore';
import { openAgentDialog } from '@/agent/commands';
import type { Action } from '../types';

const actions: Action[] = [
  {
    id: 'agent.ask',
    label: 'Ask the agent…',
    menu: 'edit',
    group: 'agent',
    order: 90,
    icon: SparkleIcon,
    shortcut: 'mod+k',
    get hidden() {
      return !useDocStore.getState().doc.wireframe;
    },
    enabled: () => !!useDocStore.getState().doc.wireframe,
    run: () => openAgentDialog({ kind: 'request' }),
  },
];

export default actions;
