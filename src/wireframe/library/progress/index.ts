// Progress bar: an optional label and percentage above a track.
import { box, lineHeight, nodes, text, truncate } from '../../kit';
import { WF_RADIUS } from '../../style';
import { defineComponent } from '../types';

const TRACK = 8;

export default defineComponent({
  kind: 'progress',
  label: 'Progress bar',
  platforms: 'all',
  category: 'Feedback',
  keywords: ['loading', 'upload', 'percent', 'status', 'bar'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Uploading', placeholder: 'None' },
    value: { type: 'number', label: 'Value', default: 60, min: 0, max: 100, step: 1, unit: '%' },
    showValue: { type: 'boolean', label: 'Show percentage', default: true },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 33 },
  build(p, { width }) {
    const hasHeader = !!p.label || p.showValue;
    const top = hasHeader ? Math.ceil(lineHeight('label')) + 8 : 0;
    const v = Math.min(100, Math.max(0, p.value));
    const children = nodes(
      p.label && text(truncate(p.label, Math.max(0, width - 48), 'label'), { x: 0, y: 0, style: 'label', name: 'Label' }),
      p.showValue && text(`${Math.round(v)}%`, { x: width, y: 0, style: 'label', tone: 'inkMuted', align: 'right', name: 'Value' }),
      box({ x: 0, y: top, width, height: TRACK, radius: WF_RADIUS.pill, fill: 'fill', stroke: 'none', name: 'Track' }),
      v > 0 && box({ x: 0, y: top, width: Math.max(TRACK, (width * v) / 100), height: TRACK, radius: WF_RADIUS.pill, fill: 'ink', stroke: 'none', name: 'Progress' }),
    );
    return { children, height: top + TRACK };
  },
  describe: (p) => `Progress bar${p.label ? ` "${p.label}"` : ''}, ${Math.round(p.value)}% complete`,
});
