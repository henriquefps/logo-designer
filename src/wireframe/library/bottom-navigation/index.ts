// Bottom navigation: 2–5 destinations, each an icon over a label; one is selected. Pinned to the
// bottom of the screen, edge to edge.
import { box, divider, icon, nodes, part, textInBand, truncate } from '../../kit';
import { WF_RADIUS } from '../../style';
import { defineComponent } from '../types';

const H = 64;
const ICON = 24;
const MAX = 5;

const sel = (p: { selected: number }, n: number) => Math.max(0, Math.min(n - 1, Math.round(p.selected) - 1));

export default defineComponent({
  kind: 'bottom-navigation',
  label: 'Bottom navigation',
  platforms: ['phone', 'tablet'],
  category: 'Navigation',
  keywords: ['tab bar', 'navigation bar', 'menu', 'footer'],
  props: {
    labels: { type: 'list', label: 'Tabs', default: ['Gallery', 'Albums', 'Settings'], item: 'Tab', min: 2, max: MAX },
    selected: { type: 'number', label: 'Selected tab', default: 1, min: 1, max: MAX, step: 1, help: '1 = the first tab.' },
    icon1: { type: 'icon', label: 'Icon, tab 1', default: 'lucide:Image' },
    icon2: { type: 'icon', label: 'Icon, tab 2', default: 'lucide:FolderOpen' },
    icon3: { type: 'icon', label: 'Icon, tab 3', default: 'lucide:Settings' },
    icon4: { type: 'icon', label: 'Icon, tab 4', default: 'lucide:Circle' },
    icon5: { type: 'icon', label: 'Icon, tab 5', default: 'lucide:Circle' },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 390, height: H },
  placement: { position: 'pinned-bottom' },
  build(p, { width }) {
    const labels = p.labels.slice(0, MAX);
    const icons = [p.icon1, p.icon2, p.icon3, p.icon4, p.icon5];
    const s = sel(p, labels.length);
    const slot = width / Math.max(1, labels.length);
    const tabs = labels.map((label, i) => {
      const cx = slot * i + slot / 2;
      const active = i === s;
      const pill = Math.min(56, slot - 8);
      return part(`Tab ${i + 1}`, nodes(
        active && pill > 0 && box({ x: cx - pill / 2, y: 8, width: pill, height: 28, radius: WF_RADIUS.pill, fill: 'fill', stroke: 'none', name: 'Selected' }),
        icon(icons[i], { x: cx - (ICON - 4) / 2, y: 12, size: ICON - 4, tone: active ? 'ink' : 'inkMuted' }),
        textInBand(truncate(label, Math.max(0, slot - 8), 'caption', active ? 600 : 400), { x: cx, y: 40, height: 18, style: 'caption', weight: active ? 600 : 400, tone: active ? 'ink' : 'inkMuted', align: 'center', name: 'Label' }),
      ));
    });
    return { children: [divider({ x: 0, y: 0.5, width }), ...tabs], height: H };
  },
  describe(p) {
    const labels = p.labels.slice(0, MAX);
    const s = sel(p, labels.length);
    return `Bottom navigation: ${labels.map((l, i) => (i === s ? `${l} (selected)` : l)).join(', ')}`;
  },
});
