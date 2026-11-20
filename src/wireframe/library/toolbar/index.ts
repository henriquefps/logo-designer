// Toolbar: a bar of actions (optionally with icons) above a table or a list, with an optional title on the
// left and a search field on the right. Edge to edge.
import { box, describeItems, divider, iconSlot, itemKey, part, rect, searchBox, textInBand, textWidth, truncate } from '../../kit';
import { WF_RADIUS, WF_SIZE, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const H = 56;
const PAD = WF_SPACE.lg;

/** Where the search field, the title and the actions that fit go (shared by `build` and `parts`). */
function toolbarLayout(p: { title: string; actions: string[]; icons: boolean; search: boolean }, width: number) {
  let right = width - PAD;
  let search: { x: number; w: number } | null = null;
  if (p.search) {
    const w = Math.min(240, Math.max(0, width * 0.3));
    if (w >= 120) {
      search = { x: right - w, w };
      right -= w + PAD;
    }
  }
  let x = PAD;
  let title = '';
  if (p.title) {
    title = truncate(p.title, Math.max(0, (right - x) * 0.4), 'subheading');
    x += textWidth(title, 'subheading') + PAD * 2;
  }
  const actions: { i: number; x: number; w: number }[] = [];
  for (let i = 0; i < p.actions.length; i++) {
    const w = Math.ceil(textWidth(p.actions[i], 'label', 500) + 24 + (p.icons ? 18 + WF_SPACE.sm : 0));
    if (x + w > right) break;
    actions.push({ i, x, w });
    x += w + WF_SPACE.sm;
  }
  return { search, title, actions };
}

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
    const l = toolbarLayout(p, width);
    const children = [];
    if (l.search) children.push(searchBox({ x: l.search.x, y: by, width: l.search.w }));
    if (l.title) children.push(textInBand(l.title, { x: PAD, y: 0, height: H, style: 'subheading', name: 'Title' }));
    const actions = [];
    for (const { i, x, w } of l.actions) {
      actions.push(
        box({ x, y: by, width: w, height: bh, radius: WF_RADIUS.md, fill: 'paper', stroke: 'line', name: 'Background' }),
        ...(p.icons ? [iconSlot({ x: x + 12, y: by + (bh - 18) / 2 })] : []),
        textInBand(p.actions[i], { x: x + 12 + (p.icons ? 18 + WF_SPACE.sm : 0), y: by, height: bh, style: 'label', weight: 500, name: 'Action' }),
      );
    }
    if (actions.length) children.push(part('Actions', actions));
    children.push(divider({ x: 0, y: H - 0.5, width }));
    return { children, height: H };
  },
  parts: (p, { width }) => toolbarLayout(p, width).actions.map(({ i, x, w }) => ({ key: itemKey(i, 'action'), label: p.actions[i], rect: rect(x, (H - WF_SIZE.controlSmall) / 2, w, WF_SIZE.controlSmall) })),
  partLists: { action: 'actions' },
  describe(p, opens) {
    const parts = ['Toolbar'];
    if (p.title) parts.push(`title "${p.title}"`);
    const actions = p.actions.map((label, i) => ({ key: itemKey(i, 'action'), label }));
    const list = actions.some((it) => opens?.has(it.key)) ? describeItems(actions, opens) : p.actions.join(', ');
    parts.push(p.actions.length ? `actions ${list}${p.icons ? ' (with icons)' : ''}` : 'no actions');
    if (p.search) parts.push('search on the right');
    return parts.join('; ');
  },
});
