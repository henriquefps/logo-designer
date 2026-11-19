import { layoutParent } from '@/wireframe/layoutEdit';
import type { PropertySection } from '../../types';
import { LayoutItemSection } from './LayoutItemSection';

/** Wireframes: the selected nodes sit in a stack / grid: their sizing and position. */
const section: PropertySection = {
  id: 'layoutItem',
  order: 7,
  when: (ctx) => !!ctx.doc.wireframe && ctx.ids.length > 0 && ctx.ids.every((id) => !!layoutParent(ctx.doc, id)),
  Component: LayoutItemSection,
};
export default section;
