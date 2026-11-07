import { ShapesIcon } from '@phosphor-icons/react';
import { IconsPanel } from '@/assets-icons/IconsPanel';
import type { AssetSource } from '../../types';

export default { id: 'icons', label: 'Icons', icon: ShapesIcon, order: 10, Component: IconsPanel } satisfies AssetSource;
