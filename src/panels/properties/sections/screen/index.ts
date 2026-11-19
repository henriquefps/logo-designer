import { isScreenNode } from '@/model';
import type { PropertySection } from '../../types';
import { ScreenSection } from './ScreenSection';

/** One screen frame selected (wireframe documents): name, platform, width, variants. */
const section: PropertySection = {
  id: 'screen',
  order: 5,
  when: (ctx) => !!ctx.doc.wireframe && ctx.nodes.length === 1 && isScreenNode(ctx.nodes[0]),
  Component: ScreenSection,
};
export default section;
