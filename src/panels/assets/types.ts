import type { Icon } from '@phosphor-icons/react';
import type { ComponentType } from 'react';

/**
 * A tab in the Assets panel (icon libraries, fonts, templates…). Put each in
 * `src/panels/assets/sources/<id>/index.ts` with `default: AssetSource`.
 * Insert content into the document with useDocStore.getState().addNodes(...) and select it.
 */
export interface AssetSource {
  id: string;
  label: string;
  icon: Icon;
  order: number;
  Component: ComponentType;
}
