// Dialog: a centred card with a title, a message and one or two actions (right aligned, the main one last).
// Free, centred on the screen.
import { box, lineHeight, nodes, text, textInBand, textWidth, truncate } from '../../kit';
import { WF_RADIUS, WF_SPACE, type WfTextStyle } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.xl;
const ACTION_H = 40;
const MAX_LINES = 6;

/** Greedy word wrap of `value` into at most `maxLines` lines no wider than `maxWidth` (the last one ends in … if cut). */
function wrap(value: string, maxWidth: number, style: WfTextStyle, maxLines: number): string[] {
  const lines: string[] = [];
  for (const para of value.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && textWidth(next, style) > maxWidth) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }
  if (lines.length <= maxLines) return lines;
  const cut = lines.slice(0, maxLines);
  cut[maxLines - 1] = truncate(`${cut[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxWidth, style);
  return cut;
}

export default defineComponent({
  kind: 'dialog',
  label: 'Dialog',
  platforms: ['phone', 'tablet'],
  category: 'Overlays',
  keywords: ['alert', 'modal', 'confirm', 'popup'],
  props: {
    title: { type: 'text', label: 'Title', default: 'Delete photo?', placeholder: 'None' },
    message: { type: 'multiline', label: 'Message', default: 'This photo will be removed from all your albums.', placeholder: 'None' },
    primary: { type: 'text', label: 'Main action', default: 'Delete' },
    secondary: { type: 'text', label: 'Other action', default: 'Cancel', placeholder: 'None', help: 'Leave empty for a dialog with one action.' },
  },
  sizing: { width: 320, height: 'hug' },
  resizable: { height: true },
  defaultSize: { width: 320, height: 200 },
  placement: { position: 'free', anchor: 'center' },
  build(p, { width, height }) {
    const inner = Math.max(0, width - PAD * 2);
    const lines = p.message ? wrap(p.message, inner, 'body', MAX_LINES) : [];
    const titleH = p.title ? Math.ceil(lineHeight('subheading')) : 0;
    const msgH = lines.length * lineHeight('body');
    const gap1 = titleH && msgH ? WF_SPACE.md : 0;
    const hasActions = !!(p.primary || p.secondary);
    // Taller box: the card fills it, the text stays on top and the actions sit on the bottom edge.
    const h = Math.max(height ?? 0, Math.ceil(PAD + titleH + gap1 + msgH + (hasActions ? WF_SPACE.xl + ACTION_H + WF_SPACE.sm : PAD)));
    const ay = h - WF_SPACE.sm - ACTION_H;
    let x = width - PAD;
    const actions = [p.primary && { label: p.primary, main: true }, p.secondary && { label: p.secondary, main: false }].filter(Boolean) as { label: string; main: boolean }[];
    const placed = actions.map((a) => {
      const label = truncate(a.label, Math.max(0, x - PAD), 'label', 600);
      const n = textInBand(label, { x, y: ay, height: ACTION_H, style: 'label', weight: a.main ? 600 : 500, tone: a.main ? 'ink' : 'inkMuted', align: 'right', name: a.main ? 'Main action' : 'Other action' });
      x -= textWidth(label, 'label', a.main ? 600 : 500) + WF_SPACE.xl;
      return n;
    });
    return {
      children: nodes(
        box({ x: 0, y: 0, width, height: h, radius: WF_RADIUS.lg, fill: 'paper', stroke: 'ink', name: 'Card' }),
        p.title && text(truncate(p.title, inner, 'subheading'), { x: PAD, y: PAD, style: 'subheading', name: 'Title' }),
        lines.length > 0 && text(lines.join('\n'), { x: PAD, y: PAD + titleH + gap1, tone: 'inkMuted', name: 'Message' }),
        ...placed,
      ),
      height: h,
    };
  },
  describe(p) {
    const parts = [`Dialog${p.title ? ` "${p.title}"` : ''}`];
    if (p.message) parts.push(`message "${p.message}"`);
    const actions = [p.primary && `"${p.primary}" (main)`, p.secondary && `"${p.secondary}"`].filter(Boolean);
    if (actions.length) parts.push(`actions: ${actions.join(', ')}`);
    return parts.join(', ');
  },
});
