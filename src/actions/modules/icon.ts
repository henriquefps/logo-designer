// App icon mode commands (see src/iconMode and src/icon).
import { AppWindowIcon, ArrowsInIcon, CrosshairIcon, SquareIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fitToKeyline } from '@/iconMode/commands';
import { makeIconDocument } from '@/iconMode/document';
import { useIconStore } from '@/iconMode/store';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import type { Action } from '../types';

const isIcon = () => !!useDocStore.getState().doc.icon;
const prefs = () => useIconStore.getState();

const actions: Action[] = [
  {
    id: 'file.exportIcon',
    label: 'Export icon…',
    menu: 'file',
    group: 'io',
    order: 21.5,
    icon: AppWindowIcon,
    enabled: isIcon,
    run: () => {
      if (isIcon()) useEditorStore.getState().openDialog('exportIcon');
    },
  },
  {
    id: 'icon.makeDocument',
    label: 'Make this an app icon document',
    menu: 'file',
    group: 'document',
    order: 30,
    icon: AppWindowIcon,
    enabled: () => !isIcon(),
    run: makeIconDocument,
  },
  {
    id: 'icon.fit',
    label: 'Fit glyph to keyline',
    menu: 'object',
    group: 'icon',
    order: 90,
    icon: ArrowsInIcon,
    enabled: isIcon,
    run: () =>
      void fitToKeyline().then((ok) => {
        if (ok) toast.success('Glyph fitted to the keyline');
      }),
  },
  {
    id: 'view.iconKeylines',
    label: 'Icon keylines',
    menu: 'view',
    group: 'icon',
    order: 20,
    icon: CrosshairIcon,
    enabled: isIcon,
    checked: () => prefs().showKeylines,
    run: () => prefs().setPrefs({ showKeylines: !prefs().showKeylines }),
  },
  {
    id: 'view.iconTile',
    label: 'Icon tile',
    menu: 'view',
    group: 'icon',
    order: 21,
    icon: SquareIcon,
    enabled: isIcon,
    checked: () => prefs().showTile,
    run: () => prefs().setPrefs({ showTile: !prefs().showTile }),
  },
  {
    id: 'view.iconLight',
    label: 'Icon light variant',
    menu: 'view',
    group: 'icon',
    order: 22,
    enabled: isIcon,
    checked: () => prefs().light,
    run: () => prefs().setPrefs({ light: !prefs().light }),
  },
];

export default actions;
