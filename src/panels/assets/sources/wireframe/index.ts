import { SquaresFourIcon } from '@phosphor-icons/react';
import type { AssetSource } from '../../types';
import { LibraryPanel } from './LibraryPanel';

/** The wireframe component library: first tab of wireframe documents, hidden elsewhere. */
export default {
  id: 'wireframe',
  label: 'Components',
  icon: SquaresFourIcon,
  order: 0,
  when: (doc) => !!doc.wireframe,
  Component: LibraryPanel,
} satisfies AssetSource;
