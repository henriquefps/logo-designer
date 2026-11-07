import { ImageSquareIcon, MagnetIcon, RulerIcon, GridFourIcon } from '@phosphor-icons/react';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import type { Action } from '../types';

const ed = () => useEditorStore.getState();

export function fitArtboard() {
  const { width, height } = useDocStore.getState().doc.artboard;
  ed().fitRect({ x: 0, y: 0, width, height });
}

const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
const nextZoom = (z: number, dir: 1 | -1) =>
  dir > 0 ? (ZOOM_STEPS.find((s) => s > z * 1.001) ?? z) : ([...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? z);

const actions: Action[] = [
  {
    id: 'view.zoomIn',
    label: 'Zoom in',
    menu: 'view',
    group: 'zoom',
    order: 0,
    shortcut: ['mod+=', 'mod+shift+='],
    run: () => ed().setZoom(nextZoom(ed().zoom, 1)),
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom out',
    menu: 'view',
    group: 'zoom',
    order: 1,
    shortcut: 'mod+-',
    run: () => ed().setZoom(nextZoom(ed().zoom, -1)),
  },
  { id: 'view.fit', label: 'Fit artboard', menu: 'view', group: 'zoom', order: 2, shortcut: 'mod+0', run: fitArtboard },
  { id: 'view.actual', label: 'Actual size (100%)', menu: 'view', group: 'zoom', order: 3, shortcut: 'mod+1', run: () => ed().setZoom(1) },
  {
    id: 'view.snapping',
    label: 'Smart guides & snapping',
    menu: 'view',
    group: 'guides',
    order: 10,
    icon: MagnetIcon,
    shortcut: 'mod+u',
    checked: () => ed().snapping,
    run: () => ed().setSnapping(!ed().snapping),
  },
  {
    id: 'view.rulers',
    label: 'Rulers',
    menu: 'view',
    group: 'guides',
    order: 11,
    icon: RulerIcon,
    shortcut: 'alt+mod+r',
    checked: () => ed().showRulers,
    run: () => ed().setViewPrefs({ showRulers: !ed().showRulers }),
  },
  {
    id: 'view.grid',
    label: 'Grid',
    menu: 'view',
    group: 'guides',
    order: 12,
    icon: GridFourIcon,
    shortcut: "mod+'",
    checked: () => ed().showGrid,
    run: () => ed().setViewPrefs({ showGrid: !ed().showGrid }),
  },
  {
    id: 'view.references',
    label: 'Show reference images',
    menu: 'view',
    group: 'guides',
    order: 14,
    icon: ImageSquareIcon,
    checked: () => ed().showReferences,
    run: () => ed().setViewPrefs({ showReferences: !ed().showReferences }),
  },
  {
    id: 'view.snapGrid',
    label: 'Snap to grid',
    menu: 'view',
    group: 'guides',
    order: 13,
    shortcut: "mod+shift+'",
    checked: () => ed().snapToGrid,
    run: () => ed().setViewPrefs({ snapToGrid: !ed().snapToGrid }),
  },
];

export default actions;
