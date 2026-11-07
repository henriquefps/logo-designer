import type { ComponentType } from 'react';
import type { DesignDocument, Id, SceneNode } from '@/model';

export interface SelectionContext {
  doc: DesignDocument;
  /** Selected ids (topmost only: no descendants of other selected nodes). */
  ids: Id[];
  nodes: SceneNode[];
}

/**
 * A block in the Properties panel. Put each in `src/panels/properties/sections/<id>/index.ts`
 * with `default: PropertySection`; the component lives next to it.
 */
export interface PropertySection {
  id: string;
  order: number;
  when: (ctx: SelectionContext) => boolean;
  Component: ComponentType<{ ctx: SelectionContext }>;
}
