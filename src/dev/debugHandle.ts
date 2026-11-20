import * as model from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import * as actions from '@/actions/registry';
import * as tools from '@/tools/registry';
import * as sync from '@/sync/engine';
import * as fontStore from '@/fonts/store';
import * as fontUploads from '@/fonts/uploads';
import * as theme from '@/theme/theme';
import * as wireframe from '@/wireframe/commands';
import * as components from '@/wireframe/componentCommands';
import * as flows from '@/wireframe/flowCommands';
import * as flowModel from '@/wireframe/flows';
import * as containers from '@/wireframe/containerCommands';
import * as symbols from '@/wireframe/symbolCommands';
import * as symbolModel from '@/wireframe/symbols';

/** Dev-only handle for browser QA scripts (`window.__designer`). Never bundled in production. */
export function installDebugHandle() {
  (window as unknown as Record<string, unknown>).__designer = { model, useDocStore, useEditorStore, useProjectsStore, actions, tools, sync, fontStore, fontUploads, theme, wireframe, components, flows, flowModel, containers, symbols, symbolModel };
}
