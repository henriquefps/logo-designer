// Section header: a small label above a group of rows, with an optional action on the right ("See all").
import { nodes, textInBand, textWidth, truncate } from '../../kit';
import { WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const H = 40;
const PAD = WF_SPACE.lg;

export default defineComponent({
  kind: 'section-header',
  label: 'Section header',
  platforms: ['phone', 'tablet'],
  category: 'Lists',
  keywords: ['group', 'title', 'subheader', 'see all'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Section' },
    action: { type: 'text', label: 'Action', default: '', placeholder: 'None', help: 'Text on the right, e.g. "See all".' },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 390, height: H },
  build(p, { width }) {
    const action = p.action ? truncate(p.action, Math.max(0, (width - PAD * 2) / 2), 'label', 500) : '';
    const actionW = action ? textWidth(action, 'label', 500) : 0;
    const room = Math.max(0, width - PAD * 2 - (actionW ? actionW + PAD : 0));
    return {
      children: nodes(
        textInBand(truncate(p.label, room, 'label', 600), { x: PAD, y: 0, height: H, style: 'label', weight: 600, tone: 'inkMuted', name: 'Label' }),
        action && textInBand(action, { x: width - PAD, y: 0, height: H, style: 'label', weight: 500, align: 'right', name: 'Action' }),
      ),
      height: H,
    };
  },
  describe: (p) => `Section header "${p.label}"${p.action ? `, action "${p.action}"` : ''}`,
});
