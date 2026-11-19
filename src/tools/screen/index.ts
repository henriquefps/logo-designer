import { DeviceMobileIcon } from '@phosphor-icons/react';
import { addScreenCommand } from '@/wireframe/commands';
import { useScreenToolPrefs } from '@/wireframe/toolPrefs';
import type { Tool } from '../types';
import { ScreenToolOptions } from './ScreenToolOptions';

/** Screen (F, wireframe documents only): click to place a screen frame, its top-left at the click. */
const screen: Tool = {
  id: 'screen',
  label: 'Screen',
  shortcut: 'f',
  icon: DeviceMobileIcon,
  cursor: 'crosshair',
  group: 'shape',
  order: -10,
  when: (doc) => !!doc.wireframe,
  Options: ScreenToolOptions,

  onPointerDown(e, ctx) {
    if (e.button !== 0 || !ctx.doc().wireframe) return;
    addScreenCommand(useScreenToolPrefs.getState().platform, e.point);
    ctx.setTool('select');
  },
};

export default screen;
