// Paragraph: grey bars standing in for body copy whose words do not matter yet.
import { textBars, textBarsHeight } from '../../kit';
import { defineComponent } from '../types';

export default defineComponent({
  kind: 'paragraph',
  label: 'Paragraph',
  platforms: 'all',
  category: 'Text',
  keywords: ['lorem', 'copy', 'bars', 'description'],
  props: {
    lines: { type: 'number', label: 'Lines', default: 3, min: 1, max: 20, step: 1 },
    size: { type: 'choice', label: 'Size', options: ['body', 'small'], default: 'body', labels: { body: 'Body (16)', small: 'Small (14)' } },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 67 },
  build(p, { width }) {
    const style = p.size === 'small' ? 'label' : 'body';
    return { children: [textBars({ x: 0, y: 0, width, lines: p.lines, style, name: 'Paragraph' })], height: Math.ceil(textBarsHeight(p.lines, style)) };
  },
  describe: (p) => `Paragraph of body copy, about ${Math.round(p.lines)} line${Math.round(p.lines) === 1 ? '' : 's'} (placeholder bars, the words are not decided)`,
});
