// Tabs: a row of labels, one selected (underlined). Edge to edge, equal-width tabs.
import { box, describeItems, divider, itemKey, selectedFromItem, nodes, part, rect, textInBand, truncate } from '../../kit';
import { defineComponent } from '../types';

const H = 48;
const MAX = 6;
const sel = (selected: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(selected) - 1));

export default defineComponent({
  kind: 'tabs',
  label: 'Tabs',
  platforms: ['phone', 'tablet'],
  category: 'Navigation',
  keywords: ['tab bar', 'top tabs', 'switcher'],
  props: {
    labels: { type: 'list', label: 'Tabs', default: ['Photos', 'Albums', 'Shared'], item: 'Tab', min: 2, max: MAX },
    selected: { type: 'number', label: 'Selected tab', default: 1, min: 1, max: MAX, step: 1, help: '1 = the first tab. Follows the screen: the tab that opens the screen on show.', auto: { label: 'Follows the screen', default: true } },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 390, height: H },
  build(p, { width }) {
    const labels = p.labels.slice(0, MAX);
    const s = sel(p.selected, labels.length);
    const slot = width / Math.max(1, labels.length);
    const tabs = labels.map((label, i) => {
      const active = i === s;
      return part(`Tab ${i + 1}`, nodes(
        textInBand(truncate(label, Math.max(0, slot - 16), 'label', active ? 600 : 500), { x: slot * i + slot / 2, y: 0, height: H - 2, style: 'label', weight: active ? 600 : 500, tone: active ? 'ink' : 'inkMuted', align: 'center', name: 'Label' }),
        active && box({ x: slot * i, y: H - 2, width: slot, height: 2, fill: 'ink', stroke: 'none', name: 'Indicator' }),
      ));
    });
    return { children: [divider({ x: 0, y: H - 0.5, width }), ...tabs], height: H };
  },
  parts(p, { width }) {
    const labels = p.labels.slice(0, MAX);
    const slot = width / Math.max(1, labels.length);
    return labels.map((label, i) => ({ key: itemKey(i), label, rect: rect(slot * i, 0, slot, H) }));
  },
  partLists: { item: 'labels' },
  selectFromPart: (_p, key) => selectedFromItem(key),
  describe(p, opens) {
    const labels = p.labels.slice(0, MAX);
    const s = sel(p.selected, labels.length);
    return `Tabs: ${describeItems(labels.map((label, i) => ({ key: itemKey(i), label, selected: i === s })), opens)}`;
  },
});
