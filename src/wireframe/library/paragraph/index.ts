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
  resizable: { height: true },
  defaultSize: { width: 342, height: 67 },
  build(p, { width, height }) {
    const style = p.size === 'small' ? 'label' : 'body';
    // Taller box: more bars, as many as fit.
    let lines = Math.max(1, Math.round(p.lines));
    while (height !== undefined && lines < 200 && textBarsHeight(lines + 1, style) <= height) lines++;
    return { children: [textBars({ x: 0, y: 0, width, lines, style, name: 'Paragraph' })], height: Math.ceil(textBarsHeight(lines, style)) };
  },
  describe: (p) => `Paragraph of body copy, about ${Math.round(p.lines)} line${Math.round(p.lines) === 1 ? '' : 's'} (placeholder bars, the words are not decided)`,
});
