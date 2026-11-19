import type { PropertySection } from '../../types';
import { LayoutSection } from './LayoutSection';

/** Wireframes: one stack / grid selected, or one screen frame (its content stack). */
const section: PropertySection = {
  id: 'layout',
  order: 6,
  when: (ctx) => !!ctx.doc.wireframe && ctx.nodes.length === 1 && ctx.nodes[0].type === 'group' && !ctx.nodes[0].component && (!!ctx.nodes[0].layout || !!ctx.nodes[0].screen),
  Component: LayoutSection,
};
export default section;
