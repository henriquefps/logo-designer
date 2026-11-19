// Wireframe document commands (see src/wireframe). Hidden in other documents.
import { CopySimpleIcon, DeviceMobileIcon, LinkBreakIcon } from '@phosphor-icons/react';
import { SCREEN_PLATFORMS } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { addScreenCommand, duplicatablePlatforms, duplicateSelectedScreenAs, selectedScreen } from '@/wireframe/commands';
import { detachSelected, selectedInstanceIds } from '@/wireframe/componentCommands';
import type { Action } from '../types';

const notWireframe = () => !useDocStore.getState().doc.wireframe;

const actions: Action[] = [
  ...SCREEN_PLATFORMS.map(
    (p, i): Action => ({
      id: `wireframe.addScreen.${p.id}`,
      label: `${p.label} screen (${p.width})`,
      menu: 'object',
      group: 'screen',
      submenu: 'Add screen',
      order: 80 + i / 10,
      icon: DeviceMobileIcon,
      get hidden() {
        return notWireframe();
      },
      run: () => void addScreenCommand(p.id),
    }),
  ),
  ...SCREEN_PLATFORMS.map(
    (p, i): Action => ({
      id: `wireframe.duplicateAs.${p.id}`,
      label: `Duplicate as ${p.label.toLowerCase()}`,
      menu: 'object',
      group: 'screen',
      submenu: 'Duplicate screen as',
      order: 81 + i / 10,
      icon: CopySimpleIcon,
      get hidden() {
        return notWireframe();
      },
      enabled: () => !!selectedScreen() && duplicatablePlatforms().includes(p.id),
      run: () => void duplicateSelectedScreenAs(p.id),
    }),
  ),
  {
    id: 'wireframe.detach',
    label: 'Detach component',
    menu: 'object',
    group: 'component',
    order: 85,
    icon: LinkBreakIcon,
    shortcut: 'mod+alt+b',
    get hidden() {
      return notWireframe();
    },
    enabled: () => selectedInstanceIds().length > 0,
    run: () => void detachSelected(),
  },
];

export default actions;
