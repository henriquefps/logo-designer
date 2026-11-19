// Radio group: an optional group label and a list of options, one selected.
import { lineHeight, nodes, radio, text, truncate } from '../../kit';
import { defineComponent } from '../types';

const ROW = 32;
const GAP = 12;
const RING = 20;

export default defineComponent({
  kind: 'radio-group',
  label: 'Radio group',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['radio', 'options', 'choice', 'single select', 'form'],
  props: {
    label: { type: 'text', label: 'Group label', default: 'Choose one', placeholder: 'None' },
    options: { type: 'list', label: 'Options', default: ['Option A', 'Option B', 'Option C'], item: 'Option', min: 1, max: 12 },
    selected: { type: 'number', label: 'Selected option', default: 1, min: 0, max: 11, step: 1, help: 'Position in the list, starting at 1 (0 = none selected).' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 130 },
  build(p, { width }) {
    const options: string[] = p.options.length ? p.options : ['Option'];
    const top = p.label ? Math.ceil(lineHeight('label')) + 8 : 0;
    const rows = options.flatMap((o, i) => [
      radio({ x: 0, y: top + i * ROW + (ROW - RING) / 2, selected: p.selected === i + 1 }),
      text(truncate(o, Math.max(0, width - RING - GAP), 'body'), { x: RING + GAP, y: top + i * ROW + (ROW - lineHeight('body')) / 2, name: 'Option' }),
    ]);
    const children = nodes(p.label && text(truncate(p.label, width, 'label'), { x: 0, y: 0, style: 'label', name: 'Label' }), ...rows);
    return { children, height: top + options.length * ROW };
  },
  describe(p) {
    const options: string[] = p.options;
    const list = options.map((o, i) => (p.selected === i + 1 ? `"${o}" (selected)` : `"${o}"`)).join(', ');
    return `Radio group${p.label ? ` "${p.label}"` : ''}: ${list}${p.selected < 1 || p.selected > options.length ? ' (none selected)' : ''}`;
  },
});
