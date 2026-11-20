// Segmented control: 2–5 options in one outlined pill, one selected (filled).
import { box, describeItems, itemKey, selectedFromItem, nodes, part, rect, textInBand, truncate } from '../../kit';
import { WF_RADIUS, WF_SIZE } from '../../style';
import { defineComponent } from '../types';

const MAX = 5;
const sel = (selected: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(selected) - 1));

export default defineComponent({
  kind: 'segmented-control',
  label: 'Segmented control',
  platforms: ['phone', 'tablet'],
  category: 'Actions',
  keywords: ['segmented button', 'toggle group', 'switcher', 'filter'],
  props: {
    labels: { type: 'list', label: 'Segments', default: ['Day', 'Week', 'Month'], item: 'Segment', min: 2, max: MAX },
    selected: { type: 'number', label: 'Selected segment', default: 1, min: 1, max: MAX, step: 1, help: '1 = the first segment. Follows the screen: the segment that opens the screen on show.', auto: { label: 'Follows the screen', default: true } },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: WF_SIZE.controlSmall },
  build(p, { width }) {
    const h = WF_SIZE.controlSmall;
    const labels = p.labels.slice(0, MAX);
    const s = sel(p.selected, labels.length);
    const slot = width / Math.max(1, labels.length);
    const segs = labels.map((label, i) => {
      const active = i === s;
      return part(`Segment ${i + 1}`, nodes(
        active && box({ x: slot * i + 2, y: 2, width: Math.max(0, slot - 4), height: h - 4, radius: WF_RADIUS.sm + 2, fill: 'ink', stroke: 'none', name: 'Selected' }),
        textInBand(truncate(label, Math.max(0, slot - 8), 'label', 500), { x: slot * i + slot / 2, y: 0, height: h, style: 'label', weight: 500, tone: active ? 'paper' : 'ink', align: 'center', name: 'Label' }),
      ));
    });
    return { children: [box({ x: 0, y: 0, width, height: h, radius: WF_RADIUS.md, fill: 'paper', stroke: 'ink', name: 'Outline' }), ...segs], height: h };
  },
  parts(p, { width }) {
    const labels = p.labels.slice(0, MAX);
    const slot = width / Math.max(1, labels.length);
    return labels.map((label, i) => ({ key: itemKey(i), label, rect: rect(slot * i, 0, slot, WF_SIZE.controlSmall) }));
  },
  partLists: { item: 'labels' },
  selectFromPart: (_p, key) => selectedFromItem(key),
  describe(p, opens) {
    const labels = p.labels.slice(0, MAX);
    const s = sel(p.selected, labels.length);
    return `Segmented control: ${describeItems(labels.map((label, i) => ({ key: itemKey(i), label, selected: i === s })), opens)}`;
  },
});
