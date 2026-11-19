// Modal window: a dialog over a web page. Title with a close button, body copy as grey bars and one or two actions.
// Opens free and centred on the screen (`placement`); it is not part of the page flow.
import { box, buttonBox, polyline, textBars, textBarsHeight, textInBand, truncate, lineHeight } from '../../kit';
import { WF_RADIUS, WF_SIZE, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.xl;

export default defineComponent({
  kind: 'modal',
  label: 'Modal window',
  platforms: ['desktop'],
  category: 'Overlays',
  keywords: ['dialog', 'popup', 'overlay', 'confirm', 'lightbox'],
  props: {
    title: { type: 'text', label: 'Title', default: 'Modal title' },
    lines: { type: 'number', label: 'Body lines', default: 3, min: 1, max: 8 },
    primary: { type: 'text', label: 'Primary action', default: 'Confirm', placeholder: 'None' },
    secondary: { type: 'text', label: 'Secondary action', default: 'Cancel', placeholder: 'None' },
    close: { type: 'boolean', label: 'Close button', default: true },
  },
  sizing: { width: 480, height: 'hug' },
  resizable: { height: true },
  defaultSize: { width: 480, height: 232 },
  placement: { position: 'free', anchor: 'center' },
  build(p, { width, height }) {
    const titleH = lineHeight('subheading');
    const bodyY = PAD + titleH + WF_SPACE.lg;
    const bodyH = textBarsHeight(p.lines);
    const hasActions = !!(p.primary || p.secondary);
    const natural = Math.ceil(hasActions ? bodyY + bodyH + PAD + WF_SIZE.control + PAD : bodyY + bodyH + PAD);
    // Taller window: the title and body stay on top, the actions sit on the bottom edge.
    const h = Math.max(natural, Math.ceil(height ?? 0));
    const actionsY = h - PAD - WF_SIZE.control;
    const children = [
      box({ x: 0, y: 0, width, height: h, radius: WF_RADIUS.lg, fill: 'paper', stroke: 'ink', name: 'Window' }),
      textInBand(truncate(p.title, Math.max(0, width - PAD * 2 - (p.close ? 32 : 0)), 'subheading'), { x: PAD, y: PAD, height: titleH, style: 'subheading', name: 'Title' }),
      textBars({ x: PAD, y: bodyY, width: Math.max(0, width - PAD * 2), lines: p.lines, name: 'Body' }),
    ];
    if (p.close) {
      const cx = width - PAD - 8;
      const cy = PAD + titleH / 2;
      children.push(polyline([{ x: cx - 6, y: cy - 6 }, { x: cx + 6, y: cy + 6 }], { stroke: 'inkMuted', width: 1.5, name: 'Close' }), polyline([{ x: cx + 6, y: cy - 6 }, { x: cx - 6, y: cy + 6 }], { stroke: 'inkMuted', width: 1.5, name: 'Close' }));
    }
    let right = width - PAD;
    if (p.primary) {
      const b = buttonBox(p.primary, { x: right, y: actionsY, height: WF_SIZE.control, align: 'right', variant: 'primary', minWidth: 88 });
      children.push(b.node);
      right -= b.width + WF_SPACE.sm;
    }
    if (p.secondary) children.push(buttonBox(p.secondary, { x: right, y: actionsY, height: WF_SIZE.control, align: 'right', variant: 'secondary', minWidth: 88 }).node);
    return { children, height: h };
  },
  describe(p) {
    const parts = [`Modal window "${p.title}"`, `${Math.round(p.lines)} body lines`];
    const actions = [p.primary && `${p.primary} (primary)`, p.secondary].filter(Boolean);
    parts.push(actions.length ? `actions ${actions.join(', ')}` : 'no actions');
    if (p.close) parts.push('close button');
    return parts.join('; ');
  },
});
