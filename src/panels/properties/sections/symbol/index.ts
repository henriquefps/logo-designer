import { locate } from '@/model';
import type { PropertySection } from '../../types';
import { SymbolSection } from './SymbolSection';

/**
 * Wireframes, one object selected: a shared component instance (name, copies, rename, detach), an
 * object inside one (edits go to every copy), or a group / container that can become one (Make component).
 */
const section: PropertySection = {
  id: 'symbol',
  order: 5.5,
  when: (ctx) => {
    if (!ctx.doc.wireframe || ctx.nodes.length !== 1) return false;
    const n = ctx.nodes[0];
    if (n.type === 'group' && (n.symbol || (!n.screen && !n.note && !n.component && !n.repeatCopy))) return true;
    return !!locate(ctx.doc, n.id)?.ancestors.some((a) => a.type === 'group' && a.symbol);
  },
  Component: SymbolSection,
};
export default section;
