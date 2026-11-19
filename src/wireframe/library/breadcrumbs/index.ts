// Breadcrumbs: where the user is in a hierarchy. The last item is the current page.
import { chevron, textInBand, textWidth } from '../../kit';
import type { SceneNode } from '@/model';
import { defineComponent } from '../types';

const H = 32;
const SEP = 20;

export default defineComponent({
  kind: 'breadcrumbs',
  label: 'Breadcrumbs',
  platforms: ['desktop', 'tablet'],
  category: 'Navigation',
  keywords: ['path', 'trail', 'hierarchy'],
  props: {
    items: { type: 'list', label: 'Items', item: 'Level', default: ['Home', 'Projects', 'Designer'], min: 1, max: 8, help: 'The last one is the current page.' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 400, height: H },
  build(p, { width }) {
    const children: SceneNode[] = [];
    let x = 0;
    p.items.forEach((label, i) => {
      const last = i === p.items.length - 1;
      const w = textWidth(label, 'label', last ? 600 : 400);
      if (x + w > width) return;
      children.push(textInBand(label, { x, y: 0, height: H, style: 'label', weight: last ? 600 : 400, tone: last ? 'ink' : 'inkMuted', name: last ? 'Current' : 'Crumb' }));
      x += w;
      if (!last && x + SEP <= width) {
        children.push(chevron({ x, y: (H - SEP) / 2, size: SEP }));
        x += SEP;
      }
    });
    return { children, height: H };
  },
  describe: (p) => `Breadcrumbs: ${p.items.join(' > ')}`,
});
