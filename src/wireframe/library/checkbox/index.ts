// Checkbox: a box and its label.
import { checkbox, lineHeight, nodes, text, truncate } from '../../kit';
import { defineComponent } from '../types';

const BOX = 20;
const GAP = 12;

export default defineComponent({
  kind: 'checkbox',
  label: 'Checkbox',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['check', 'tick', 'agree', 'terms', 'option', 'form'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Checkbox label' },
    checked: { type: 'boolean', label: 'Checked', default: false },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 24 },
  build(p, { width }) {
    const h = Math.max(24, Math.ceil(lineHeight('body')));
    const children = nodes(
      checkbox({ x: 0, y: (h - BOX) / 2, checked: p.checked }),
      p.label && text(truncate(p.label, Math.max(0, width - BOX - GAP), 'body'), { x: BOX + GAP, y: (h - lineHeight('body')) / 2, name: 'Label' }),
    );
    return { children, height: h };
  },
  describe: (p) => `Checkbox "${p.label}" (${p.checked ? 'checked' : 'unchecked'})`,
});
