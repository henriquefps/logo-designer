// Breadcrumbs: where the user is in a hierarchy. The last item is the current page.
import { chevron, describeItems, itemKey, rect, textInBand, textWidth } from '../../kit';
import type { SceneNode } from '@/model';
import { defineComponent } from '../types';

const H = 32;
const SEP = 20;

/** Where each drawn crumb goes (items that do not fit are left out) and its chevron after it. */
function crumbs(items: readonly string[], width: number): { i: number; x: number; w: number; chevron: number | null }[] {
  const out: { i: number; x: number; w: number; chevron: number | null }[] = [];
  let x = 0;
  items.forEach((label, i) => {
    const last = i === items.length - 1;
    const w = textWidth(label, 'label', last ? 600 : 400);
    if (x + w > width) return;
    const c = { i, x, w, chevron: null as number | null };
    out.push(c);
    x += w;
    if (!last && x + SEP <= width) {
      c.chevron = x;
      x += SEP;
    }
  });
  return out;
}

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
    for (const c of crumbs(p.items, width)) {
      const last = c.i === p.items.length - 1;
      children.push(textInBand(p.items[c.i], { x: c.x, y: 0, height: H, style: 'label', weight: last ? 600 : 400, tone: last ? 'ink' : 'inkMuted', name: last ? 'Current' : 'Crumb' }));
      if (c.chevron !== null) children.push(chevron({ x: c.chevron, y: (H - SEP) / 2, size: SEP }));
    }
    return { children, height: H };
  },
  parts: (p, { width }) => crumbs(p.items, width).map((c) => ({ key: itemKey(c.i), label: p.items[c.i], rect: rect(c.x, 0, c.w, H) })),
  partLists: { item: 'items' },
  describe(p, opens) {
    const items = p.items.map((label, i) => ({ key: itemKey(i), label }));
    return items.some((it) => opens?.has(it.key)) ? `Breadcrumbs: ${describeItems(items, opens)}` : `Breadcrumbs: ${p.items.join(' > ')}`;
  },
});
