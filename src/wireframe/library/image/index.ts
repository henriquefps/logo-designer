// Image: a grey box with an X at a chosen aspect ratio, with an optional caption. What the picture
// shows is not drawn; it is written for the AI export.
import { imagePlaceholder, lineHeight, nodes, text, truncate } from '../../kit';
import { WF_RADIUS } from '../../style';
import { defineComponent } from '../types';

const RATIOS = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9, '3:4': 3 / 4 } as const;
const CAPTION_GAP = 8;

export default defineComponent({
  kind: 'image',
  label: 'Image',
  platforms: 'all',
  category: 'Media',
  keywords: ['photo', 'picture', 'cover', 'banner', 'hero', 'thumbnail'],
  props: {
    ratio: { type: 'choice', label: 'Aspect ratio', options: ['1:1', '4:3', '16:9', '3:4', 'free'], default: '16:9', labels: { free: 'Free (resize it)' } },
    subject: { type: 'text', label: 'What it shows', default: '', placeholder: 'e.g. product photo', help: 'Not drawn; the AI export reads it.' },
    caption: { type: 'text', label: 'Caption', default: '', placeholder: 'None' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 192 },
  build(p, { width, height }) {
    const capH = p.caption ? CAPTION_GAP + Math.ceil(lineHeight('caption')) : 0;
    const ratio = RATIOS[p.ratio as keyof typeof RATIOS];
    const imgH = Math.max(1, Math.round(ratio ? width / ratio : height !== undefined ? height - capH : width * 0.6));
    const children = nodes(
      imagePlaceholder({ x: 0, y: 0, width, height: imgH, radius: WF_RADIUS.md }),
      p.caption && text(truncate(p.caption, width, 'caption'), { x: 0, y: imgH + CAPTION_GAP, style: 'caption', tone: 'inkMuted', name: 'Caption' }),
    );
    return { children, height: imgH + capH };
  },
  describe(p) {
    const parts = [`Image ${p.ratio === 'free' ? 'free-form' : p.ratio} (placeholder)`];
    if (p.subject) parts.push(`showing ${p.subject}`);
    if (p.caption) parts.push(`caption "${p.caption}"`);
    return parts.join(', ');
  },
});
