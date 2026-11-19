// Divider: a hairline across the width, optionally with a word in the middle ("or").
import { divider, lineHeight, nodes, text, textWidth, truncate } from '../../kit';
import { WF_SPACE } from '../../style';
import { defineComponent } from '../types';

export default defineComponent({
  kind: 'divider',
  label: 'Divider',
  platforms: 'all',
  category: 'Content',
  keywords: ['line', 'separator', 'rule', 'hr', 'or'],
  props: {
    label: { type: 'text', label: 'Label', default: '', placeholder: 'None', help: 'A short word in the middle, like "or".' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 17 },
  build(p, { width }) {
    const h = Math.ceil(lineHeight('caption')) + 1;
    const mid = h / 2;
    if (!p.label) return { children: [divider({ x: 0, y: mid, width })], height: h };
    const label = truncate(p.label, Math.max(0, width - 64), 'caption');
    const w = textWidth(label, 'caption');
    const gap = WF_SPACE.md;
    const side = Math.max(0, (width - w) / 2 - gap);
    const children = nodes(
      divider({ x: 0, y: mid, width: side }),
      label && text(label, { x: width / 2, y: (h - lineHeight('caption')) / 2, style: 'caption', tone: 'inkMuted', align: 'center', name: 'Label' }),
      divider({ x: width - side, y: mid, width: side }),
    );
    return { children, height: h };
  },
  describe: (p) => (p.label ? `Divider with label "${p.label}"` : 'Divider'),
});
