// Slider: an optional label and value above a track with a knob.
import { box, circle, lineHeight, nodes, text, truncate } from '../../kit';
import { WF_RADIUS } from '../../style';
import { defineComponent } from '../types';

const KNOB = 20;
const TRACK = 4;

export default defineComponent({
  kind: 'slider',
  label: 'Slider',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['range', 'volume', 'brightness', 'control'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Volume', placeholder: 'None' },
    value: { type: 'number', label: 'Value', default: 40, min: 0, max: 100, step: 1, unit: '%' },
    showValue: { type: 'boolean', label: 'Show value', default: true },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 48 },
  build(p, { width }) {
    const hasHeader = !!p.label || p.showValue;
    const top = hasHeader ? Math.ceil(lineHeight('label')) + 8 : 0;
    const cy = top + KNOB / 2;
    const v = Math.min(100, Math.max(0, p.value));
    const x = KNOB / 2 + ((width - KNOB) * v) / 100;
    const valueText = `${Math.round(v)}%`;
    const children = nodes(
      p.label && text(truncate(p.label, Math.max(0, width - 48), 'label'), { x: 0, y: 0, style: 'label', name: 'Label' }),
      p.showValue && text(valueText, { x: width, y: 0, style: 'label', tone: 'inkMuted', align: 'right', name: 'Value' }),
      box({ x: 0, y: cy - TRACK / 2, width, height: TRACK, radius: WF_RADIUS.pill, fill: 'fill', stroke: 'none', name: 'Track' }),
      box({ x: 0, y: cy - TRACK / 2, width: x, height: TRACK, radius: WF_RADIUS.pill, fill: 'ink', stroke: 'none', name: 'Progress' }),
      circle({ x: x - KNOB / 2, y: top, size: KNOB, fill: 'paper', stroke: 'ink', name: 'Knob' }),
    );
    return { children, height: top + KNOB };
  },
  describe: (p) => `Slider${p.label ? ` "${p.label}"` : ''}, value ${Math.round(p.value)} of 100`,
});
