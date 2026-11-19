// Avatar: a round picture of a person, as initials or a grey silhouette (an image).
import { avatar, circle, lineHeight, part, text } from '../../kit';
import { defineComponent } from '../types';

const SIZES = { small: { px: 32, style: 'caption' }, medium: { px: 40, style: 'label' }, large: { px: 64, style: 'subheading' }, xlarge: { px: 96, style: 'title' } } as const;

export default defineComponent({
  kind: 'avatar',
  label: 'Avatar',
  platforms: 'all',
  category: 'Media',
  keywords: ['profile', 'user', 'photo', 'initials', 'person'],
  props: {
    size: { type: 'choice', label: 'Size', options: ['small', 'medium', 'large', 'xlarge'], default: 'medium', labels: { small: 'Small (32)', medium: 'Medium (40)', large: 'Large (64)', xlarge: 'Extra large (96)' } },
    content: { type: 'choice', label: 'Shows', options: ['initials', 'image'], default: 'initials', labels: { image: 'Image (silhouette)' } },
    initials: { type: 'text', label: 'Initials', default: 'AB', visibleWhen: { content: 'initials' } },
  },
  sizing: { width: 'hug', height: 'hug' },
  resizable: { width: false },
  defaultSize: { width: 40, height: 40 },
  build(p) {
    const s = SIZES[p.size as keyof typeof SIZES] ?? SIZES.medium;
    const initials = p.initials.trim().slice(0, 3).toUpperCase();
    const children =
      p.content === 'initials' && initials
        ? [part('Avatar', [circle({ x: 0, y: 0, size: s.px, fill: 'fill', stroke: 'line', name: 'Circle' }), text(initials, { x: s.px / 2, y: (s.px - lineHeight(s.style)) / 2, style: s.style, weight: 600, tone: 'inkMuted', align: 'center', name: 'Initials' })])]
        : [avatar({ x: 0, y: 0, size: s.px })];
    return { children, height: s.px, width: s.px };
  },
  describe: (p) => `Avatar (${p.size}, ${p.content === 'initials' && p.initials.trim() ? `initials "${p.initials.trim().slice(0, 3).toUpperCase()}"` : 'image'})`,
});
