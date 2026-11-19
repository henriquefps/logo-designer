// Floating action button: a round button with an icon; with a label it becomes the extended pill.
// Free on the screen, near the bottom right.
import { box, icon, nodes, textInBand, textWidth, truncate } from '../../kit';
import { iconDisplayName } from '../../icons';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const SIZE = 56;
const ICON = 24;
const PAD = WF_SPACE.lg;

export default defineComponent({
  kind: 'fab',
  label: 'FAB',
  platforms: ['phone', 'tablet'],
  category: 'Actions',
  keywords: ['floating action button', 'add', 'create', 'compose'],
  props: {
    icon: { type: 'icon', label: 'Icon', default: 'lucide:Plus' },
    label: { type: 'text', label: 'Label', default: '', placeholder: 'None', help: 'With a label the button is extended (a pill).' },
  },
  sizing: { width: 'hug', height: 'hug' },
  defaultSize: { width: SIZE, height: SIZE },
  placement: { position: 'free', anchor: 'bottom-right' },
  build(p, { width }) {
    const iconW = p.icon ? ICON : 0;
    const label = p.label ? truncate(p.label, Math.max(0, width - PAD * 2 - (iconW ? iconW + WF_SPACE.sm : 0)), 'label', 600) : '';
    const labelW = label ? textWidth(label, 'label', 600) : 0;
    const content = iconW + (iconW && labelW ? WF_SPACE.sm : 0) + labelW;
    const start = (width - content) / 2;
    const intrinsic = p.label ? Math.ceil(PAD * 2 + iconW + (iconW ? WF_SPACE.sm : 0) + textWidth(p.label, 'label', 600)) : SIZE;
    return {
      children: nodes(
        box({ x: 0, y: 0, width, height: SIZE, radius: WF_RADIUS.pill, fill: 'ink', stroke: 'none', name: 'Background' }),
        icon(p.icon, { x: start, y: (SIZE - ICON) / 2, size: ICON, tone: 'paper' }),
        label && textInBand(label, { x: start + iconW + (iconW ? WF_SPACE.sm : 0), y: 0, height: SIZE, style: 'label', weight: 600, tone: 'paper', name: 'Label' }),
      ),
      height: SIZE,
      width: Math.max(SIZE, intrinsic),
    };
  },
  describe: (p) => (p.label ? `Extended FAB "${p.label}"` : 'FAB') + (p.icon ? ` with icon ${iconDisplayName(p.icon)}` : ''),
});
