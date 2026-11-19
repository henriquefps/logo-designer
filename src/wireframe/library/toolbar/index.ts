// Toolbar: a bar of actions (optionally with icons) above a table or a list, with an optional title on the
// left and a search field on the right. Edge to edge.
import { box, divider, iconSlot, part, searchBox, textInBand, textWidth, truncate } from '../../kit';
import { WF_RADIUS, WF_SIZE, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const H = 56;
const PAD = WF_SPACE.lg;

export default defineComponent({
  kind: 'toolbar',
  label: 'Toolbar',
  platforms: ['desktop', 'tablet'],
  category: 'Navigation',
  keywords: ['actions', 'command bar', 'filter bar', 'buttons'],
  props: {
    title: { type: 'text', label: 'Title', default: '', placeholder: 'None' },
    actions: { type: 'list', label: 'Actions', item: 'Action', default: ['New', 'Upload', 'Filter', 'Sort'], min: 0, max: 8 },
    icons: { type: 'boolean', label: 'Icons', default: false },
    search: { type: 'boolean', label: 'Search on the right', default: true },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 800, height: H },
  build(p, { width }) {
    const bh = WF_SIZE.controlSmall;
    const by = (H - bh) / 2;
    let right = width - PAD;
    const children = [];
    if (p.search) {
      const w = Math.min(240, Math.max(0, width * 0.3));
      if (w >= 120) {
        children.push(searchBox({ x: right - w, y: by, width: w }));
        right -= w + PAD;
      }
    }
    let x = PAD;
    if (p.title) {
      const t = truncate(p.title, Math.max(0, (right - x) * 0.4), 'subheading');
      children.push(textInBand(t, { x, y: 0, height: H, style: 'subheading', name: 'Title' }));
      x += textWidth(t, 'subheading') + PAD * 2;
    }
    const actions = [];
    for (const label of p.actions) {
      const w = Math.ceil(textWidth(label, 'label', 500) + 24 + (p.icons ? 18 + WF_SPACE.sm : 0));
      if (x + w > right) break;
      actions.push(
        box({ x, y: by, width: w, height: bh, radius: WF_RADIUS.md, fill: 'paper', stroke: 'line', name: 'Background' }),
        ...(p.icons ? [iconSlot({ x: x + 12, y: by + (bh - 18) / 2 })] : []),
        textInBand(label, { x: x + 12 + (p.icons ? 18 + WF_SPACE.sm : 0), y: by, height: bh, style: 'label', weight: 500, name: 'Action' }),
      );
      x += w + WF_SPACE.sm;
    }
    if (actions.length) children.push(part('Actions', actions));
    children.push(divider({ x: 0, y: H - 0.5, width }));
    return { children, height: H };
  },
  describe(p) {
    const parts = ['Toolbar'];
    if (p.title) parts.push(`title "${p.title}"`);
    parts.push(p.actions.length ? `actions ${p.actions.join(', ')}${p.icons ? ' (with icons)' : ''}` : 'no actions');
    if (p.search) parts.push('search on the right');
    return parts.join('; ');
  },
});
