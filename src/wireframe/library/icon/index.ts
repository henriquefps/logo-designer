// Icon: one glyph from the icon libraries, at a chosen size.
import { box, icon } from '../../kit';
import { iconDisplayName } from '../../icons';
import { defineComponent } from '../types';

export default defineComponent({
  kind: 'icon',
  label: 'Icon',
  platforms: 'all',
  category: 'Media',
  keywords: ['glyph', 'symbol', 'pictogram'],
  props: {
    icon: { type: 'icon', label: 'Icon', default: 'lucide:Star' },
    size: { type: 'number', label: 'Size', default: 24, min: 12, max: 128, step: 4, unit: 'px' },
    tone: { type: 'choice', label: 'Emphasis', options: ['normal', 'muted'], default: 'normal', labels: { normal: 'Normal', muted: 'Secondary (grey)' } },
  },
  sizing: { width: 'hug', height: 'hug' },
  defaultSize: { width: 24, height: 24 },
  build(p) {
    const size = Math.round(p.size);
    const glyph = icon(p.icon, { x: 0, y: 0, size, tone: p.tone === 'muted' ? 'inkMuted' : 'ink' });
    return { children: [glyph ?? box({ x: 0, y: 0, width: size, height: size, radius: 4, fill: 'none', stroke: 'line', name: 'No icon' })], height: size, width: size };
  },
  describe: (p) => `Icon ${p.icon ? iconDisplayName(p.icon) : '(none chosen)'}, ${Math.round(p.size)}px${p.tone === 'muted' ? ', secondary' : ''}`,
});
