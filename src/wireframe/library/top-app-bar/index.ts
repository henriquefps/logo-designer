// Top app bar: optional leading button (back / menu / close), title, up to three action icons, and an
// optional large title under the bar. Sits edge to edge at the top of a screen.
import { divider, icon, nodes, part, polyline, text, textInBand, truncate, lineHeight } from '../../kit';
import { iconDisplayName } from '../../icons';
import { WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const BAR = 56;
const LARGE = 52;
const ICON = 24;
const PAD = WF_SPACE.lg;

/** A leading glyph drawn from lines (back arrow, menu, close) in a `size` box at (x, y). */
function leadingGlyph(kind: string, x: number, y: number, size = ICON) {
  const m = size * 0.2;
  const [l, r, t, b, cx, cy] = [x + m, x + size - m, y + m, y + size - m, x + size / 2, y + size / 2];
  if (kind === 'back')
    return part('Back', [polyline([{ x: r, y: cy }, { x: l, y: cy }], { stroke: 'ink', width: 1.5 }), polyline([{ x: cx, y: t + 1 }, { x: l, y: cy }, { x: cx, y: b - 1 }], { stroke: 'ink', width: 1.5 })]);
  if (kind === 'menu')
    return part('Menu', [t + 2, cy, b - 2].map((yy) => polyline([{ x: l, y: yy }, { x: r, y: yy }], { stroke: 'ink', width: 1.5 })));
  return part('Close', [polyline([{ x: l + 1, y: t + 1 }, { x: r - 1, y: b - 1 }], { stroke: 'ink', width: 1.5 }), polyline([{ x: r - 1, y: t + 1 }, { x: l + 1, y: b - 1 }], { stroke: 'ink', width: 1.5 })]);
}

export default defineComponent({
  kind: 'top-app-bar',
  label: 'Top app bar',
  platforms: ['phone', 'tablet'],
  category: 'Navigation',
  keywords: ['header', 'navigation bar', 'toolbar', 'title', 'back'],
  props: {
    title: { type: 'text', label: 'Title', default: 'Title' },
    leading: { type: 'choice', label: 'Leading', options: ['none', 'back', 'menu', 'close'], default: 'back', labels: { back: 'Back', menu: 'Menu', close: 'Close', none: 'None' } },
    actions: { type: 'number', label: 'Actions', default: 1, min: 0, max: 3, step: 1, help: 'How many icons on the right (0–3).' },
    action1: { type: 'icon', label: 'Action 1', default: 'lucide:Search', visibleWhen: { actions: [1, 2, 3] } },
    action2: { type: 'icon', label: 'Action 2', default: 'lucide:Share2', visibleWhen: { actions: [2, 3] } },
    action3: { type: 'icon', label: 'Action 3', default: 'lucide:EllipsisVertical', visibleWhen: { actions: 3 } },
    large: { type: 'boolean', label: 'Large title', default: false, help: 'The title sits on its own line under the icons.' },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 390, height: BAR },
  build(p, { width }) {
    const h = p.large ? BAR + LARGE : BAR;
    const actions = [p.action1, p.action2, p.action3].slice(0, Math.max(0, Math.min(3, Math.round(p.actions)))).filter(Boolean);
    let left = PAD;
    const lead = p.leading !== 'none' ? leadingGlyph(p.leading, PAD, (BAR - ICON) / 2) : null;
    if (lead) left += ICON + WF_SPACE.lg;
    let right = width - PAD;
    const acts = actions.map((a, i) => {
      const x = width - PAD - ICON - i * (ICON + WF_SPACE.lg);
      right = x - WF_SPACE.lg;
      return icon(a, { x, y: (BAR - ICON) / 2, size: ICON });
    });
    const room = Math.max(0, right - left);
    const children = nodes(
      lead,
      acts.length ? part('Actions', nodes(...acts)) : null,
      p.title && !p.large && textInBand(truncate(p.title, room, 'subheading'), { x: left, y: 0, height: BAR, style: 'subheading', name: 'Title' }),
      p.title && p.large && text(truncate(p.title, width - PAD * 2, 'title'), { x: PAD, y: BAR + (LARGE - lineHeight('title')) / 2 - 2, style: 'title', name: 'Title' }),
      divider({ x: 0, y: h - 0.5, width }),
    );
    return { children, height: h };
  },
  describe(p) {
    const parts = [`Top app bar "${p.title}"`];
    if (p.large) parts.push('large title');
    if (p.leading !== 'none') parts.push(`leading ${p.leading} button`);
    const actions = [p.action1, p.action2, p.action3].slice(0, Math.max(0, Math.min(3, Math.round(p.actions)))).filter(Boolean);
    if (actions.length) parts.push(`actions: ${actions.map(iconDisplayName).join(', ')}`);
    return parts.join(', ');
  },
});
