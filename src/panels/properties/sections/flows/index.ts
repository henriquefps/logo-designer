import { canFlowFrom } from '@/wireframe/flows';
import type { PropertySection } from '../../types';
import { FlowsSection } from './FlowsSection';

/** Wireframes: one element inside a screen selected: the screens it opens (outgoing flows). */
const section: PropertySection = {
  id: 'flows',
  order: 8,
  when: (ctx) => !!ctx.doc.wireframe && ctx.ids.length === 1 && canFlowFrom(ctx.doc, ctx.ids[0]),
  Component: FlowsSection,
};
export default section;
