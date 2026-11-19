// Toggle: a label (and optional description) with a switch at the right.
import { lineHeight, nodes, text, toggle, truncate, TOGGLE } from '../../kit';
import { defineComponent } from '../types';

const GAP = 16;

export default defineComponent({
  kind: 'toggle',
  label: 'Toggle',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['switch', 'on off', 'setting', 'enable'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Toggle label' },
    description: { type: 'text', label: 'Description', default: '', placeholder: 'None' },
    on: { type: 'boolean', label: 'On', default: true },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 40 },
  build(p, { width }) {
    const titleH = lineHeight('body');
    const subH = lineHeight('label');
    const h = p.description ? 56 : 40;
    const room = Math.max(0, width - TOGGLE.width - GAP);
    const top = p.description ? (h - (titleH + 2 + subH)) / 2 : (h - titleH) / 2;
    const children = nodes(
      text(truncate(p.label, room, 'body'), { x: 0, y: top, name: 'Label' }),
      p.description && text(truncate(p.description, room, 'label', 400), { x: 0, y: top + titleH + 2, style: 'label', weight: 400, tone: 'inkMuted', name: 'Description' }),
      toggle({ x: width - TOGGLE.width, y: (h - TOGGLE.height) / 2, on: p.on }),
    );
    return { children, height: h };
  },
  describe: (p) => `Toggle "${p.label}"${p.description ? `, description "${p.description}"` : ''} (${p.on ? 'on' : 'off'})`,
});
