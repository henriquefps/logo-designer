// Chip (tag): a small pill with a label; selected is filled; optional icon and close button.
import { box, icon, nodes, polyline, textInBand, textWidth } from '../../kit';
import { iconDisplayName } from '../../icons';
import { WF_RADIUS, WF_SIZE, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.md;
const ICON = 16;
const GAP = WF_SPACE.xs + 2;

export default defineComponent({
  kind: 'chip',
  label: 'Chip',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['tag', 'filter', 'pill', 'badge', 'label'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Chip' },
    selected: { type: 'boolean', label: 'Selected', default: false },
    icon: { type: 'icon', label: 'Icon', default: '' },
    closable: { type: 'boolean', label: 'Close button', default: false },
  },
  sizing: { width: 'hug', height: 'hug' },
  defaultSize: { width: 80, height: WF_SIZE.controlSmall },
  build(p, { width }) {
    const h = WF_SIZE.controlSmall;
    const labelW = p.label ? Math.ceil(textWidth(p.label, 'label')) : 0;
    const iconW = p.icon ? ICON : 0;
    const closeW = p.closable ? ICON : 0;
    const parts = [iconW, labelW, closeW].filter(Boolean);
    const content = parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * GAP;
    const intrinsic = Math.max(Math.ceil(content + PAD * 2), h);
    const start = (width - content) / 2;
    const tone = p.selected ? 'paper' : 'ink';
    let x = start;
    const out = [box({ x: 0, y: 0, width, height: h, radius: WF_RADIUS.pill, fill: p.selected ? 'ink' : 'paper', stroke: p.selected ? 'none' : 'inkMuted', name: 'Background' })];
    if (p.icon) {
      out.push(...nodes(icon(p.icon, { x, y: (h - ICON) / 2, size: ICON, tone })));
      x += ICON + GAP;
    }
    if (p.label) {
      out.push(textInBand(p.label, { x, y: 0, height: h, style: 'label', tone, name: 'Label' }));
      x += labelW + GAP;
    }
    if (p.closable) {
      const c = 5;
      const cx = x + ICON / 2;
      out.push(
        polyline([{ x: cx - c, y: h / 2 - c }, { x: cx + c, y: h / 2 + c }], { stroke: tone, width: 1.5, name: 'Close' }),
        polyline([{ x: cx + c, y: h / 2 - c }, { x: cx - c, y: h / 2 + c }], { stroke: tone, width: 1.5, name: 'Close' }),
      );
    }
    return { children: out, height: h, width: intrinsic };
  },
  describe(p) {
    const parts = [`Chip "${p.label}"`];
    if (p.icon) parts.push(`icon ${iconDisplayName(p.icon)}`);
    parts.push(p.selected ? 'selected' : 'not selected');
    if (p.closable) parts.push('with close button');
    return parts.join(', ');
  },
});
