// Wireframe document commands (see src/wireframe). Hidden in other documents.
import { CopySimpleIcon, DeviceMobileIcon, DiamondsFourIcon, LinkBreakIcon, PlayIcon } from '@phosphor-icons/react';
import { SCREEN_PLATFORMS } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { addScreenCommand, duplicatablePlatforms, duplicateSelectedScreenAs, selectedScreen } from '@/wireframe/commands';
import { detachSelected, selectedInstanceIds } from '@/wireframe/componentCommands';
import { enterPresentMode } from '@/wireframe/presentStore';
import { detachSymbolSelected, makeTarget, selectedSymbolInstanceIds, startMakeComponent } from '@/wireframe/symbolCommands';
import type { Action } from '../types';

const notWireframe = () => !useDocStore.getState().doc.wireframe;

const actions: Action[] = [
  {
    id: 'view.present',
    label: 'Present',
    menu: 'view',
    group: 'present',
    order: 30,
    icon: PlayIcon,
    shortcut: 'alt+mod+p',
    get hidden() {
      return notWireframe();
    },
    enabled: () => !notWireframe(),
    run: () => void enterPresentMode(),
  },
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
    // Library instances become plain shapes; shared component instances become plain content.
    enabled: () => selectedInstanceIds().length > 0 || selectedSymbolInstanceIds().length > 0,
    run: () => {
      detachSelected();
      detachSymbolSelected();
    },
  },
  {
    id: 'wireframe.makeComponent',
    label: 'Make component…',
    menu: 'object',
    group: 'component',
    order: 84,
    icon: DiamondsFourIcon,
    // Alt + Shift like the stack commands (⌥⇧V/H/G): clear of the tool letters.
    shortcut: 'alt+shift+k',
    get hidden() {
      return notWireframe();
    },
    enabled: () => makeTarget() !== null,
    run: () => void startMakeComponent(),
  },
];

export default actions;
