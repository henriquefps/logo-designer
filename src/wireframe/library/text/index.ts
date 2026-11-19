// Text: real body copy, one or more lines of words that matter (a description, a legal line, an error
// message). For copy whose words do not matter, use Paragraph (grey bars).
import { text } from '../../kit';
import { defineComponent } from '../types';
import { wrapLines } from '../common';

const STYLES = { body: 'body', small: 'label', caption: 'caption' } as const;

export default defineComponent({
  kind: 'text',
  label: 'Text',
  platforms: 'all',
  category: 'Text',
  keywords: ['body', 'copy', 'label', 'description', 'caption'],
  props: {
    text: { type: 'multiline', label: 'Text', default: 'Body text. Replace it with the words this screen needs.' },
    size: { type: 'choice', label: 'Size', options: ['body', 'small', 'caption'], default: 'body', labels: { body: 'Body (16)', small: 'Small (14)', caption: 'Caption (12)' } },
    tone: { type: 'choice', label: 'Emphasis', options: ['normal', 'muted'], default: 'normal', labels: { normal: 'Normal', muted: 'Secondary (grey)' } },
    align: { type: 'choice', label: 'Align', options: ['left', 'center', 'right'], default: 'left' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 45 },
  build(p, { width }) {
    const style = STYLES[p.size as keyof typeof STYLES] ?? 'body';
    const align = p.align as 'left' | 'center' | 'right';
    const lines = wrapLines(p.text, width, style);
    const x = align === 'center' ? width / 2 : align === 'right' ? width : 0;
    const lh = { body: 16 * 1.4, label: 14 * 1.3, caption: 12 * 1.3 }[style];
    return { children: [text(lines.join('\n'), { x, y: 0, style, align, tone: p.tone === 'muted' ? 'inkMuted' : 'ink', name: 'Text' })], height: Math.ceil(lines.length * lh) };
  },
  describe: (p) => `Text "${p.text.replace(/\s*\n\s*/g, ' ')}"${p.size !== 'body' ? ` (${p.size})` : ''}${p.tone === 'muted' ? ', secondary' : ''}${p.align !== 'left' ? `, ${p.align} aligned` : ''}`,
});
