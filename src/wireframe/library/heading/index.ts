// Heading: a real title line (screen titles, section titles). One of three sizes.
import { lineHeight, text } from '../../kit';
import { defineComponent } from '../types';

const LEVELS = { title: 'title', heading: 'heading', subheading: 'subheading' } as const;

export default defineComponent({
  kind: 'heading',
  label: 'Heading',
  platforms: 'all',
  category: 'Text',
  keywords: ['title', 'header', 'h1', 'h2', 'section'],
  props: {
    text: { type: 'text', label: 'Text', default: 'Heading' },
    level: { type: 'choice', label: 'Level', options: ['title', 'heading', 'subheading'], default: 'heading' },
    align: { type: 'choice', label: 'Align', options: ['left', 'center', 'right'], default: 'left' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 29 },
  build(props, { width }) {
    const style = LEVELS[props.level as keyof typeof LEVELS] ?? 'heading';
    const align = props.align as 'left' | 'center' | 'right';
    const x = align === 'center' ? width / 2 : align === 'right' ? width : 0;
    return { children: [text(props.text, { x, y: 0, style, align, name: 'Text' })], height: Math.ceil(lineHeight(style)) };
  },
  describe: (props) => `${props.level === 'title' ? 'Title' : props.level === 'subheading' ? 'Subheading' : 'Heading'} "${props.text}"${props.align !== 'left' ? ` (${props.align} aligned)` : ''}`,
});
