import { isComponentNode } from '@/model';
import type { PropertySection } from '../../types';
import { ComponentSection } from './ComponentSection';

/** One component instance selected (wireframe documents): its props, generated from the definition. */
const section: PropertySection = {
  id: 'component',
  order: 6,
  when: (ctx) => !!ctx.doc.wireframe && ctx.nodes.length === 1 && isComponentNode(ctx.nodes[0]),
  Component: ComponentSection,
};
export default section;
