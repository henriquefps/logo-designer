// Snackbar: a short dark message bar with an optional action ("Undo"). Free, near the bottom of the screen.
import { box, nodes, textInBand, textWidth, truncate } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const H = 48;
const PAD = WF_SPACE.lg;

export default defineComponent({
  kind: 'snackbar',
  label: 'Snackbar',
  platforms: ['phone', 'tablet'],
  category: 'Overlays',
  keywords: ['toast', 'message', 'undo', 'feedback'],
  props: {
    message: { type: 'text', label: 'Message', default: 'Photo deleted' },
    action: { type: 'text', label: 'Action', default: 'Undo', placeholder: 'None' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 358, height: H },
  placement: { position: 'free', anchor: 'bottom' },
  build(p, { width }) {
    const action = p.action ? truncate(p.action, Math.max(0, (width - PAD * 2) / 2), 'label', 600) : '';
    const actionW = action ? textWidth(action, 'label', 600) : 0;
    const room = Math.max(0, width - PAD * 2 - (actionW ? actionW + PAD : 0));
    return {
      children: nodes(
        box({ x: 0, y: 0, width, height: H, radius: WF_RADIUS.md, fill: 'ink', stroke: 'none', name: 'Background' }),
        textInBand(truncate(p.message, room, 'label', 400), { x: PAD, y: 0, height: H, style: 'label', weight: 400, tone: 'paper', name: 'Message' }),
        action && textInBand(action, { x: width - PAD, y: 0, height: H, style: 'label', weight: 600, tone: 'paper', align: 'right', name: 'Action' }),
      ),
      height: H,
    };
  },
  describe: (p) => `Snackbar "${p.message}"${p.action ? `, action "${p.action}"` : ''}`,
});
