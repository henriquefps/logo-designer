// Empty state: a centred icon, title and message, with an optional button (a list with nothing in it yet).
import { createGroup } from '@/model';
import { icon, lineHeight, nodes, text, truncate } from '../../kit';
import { iconDisplayName } from '../../icons';
import { WF_SPACE } from '../../style';
import { defineComponent } from '../types';
import { wrapLines } from '../common';
import button from '../button';

const ICON = 48;
const PAD = WF_SPACE.xl;

export default defineComponent({
  kind: 'empty-state',
  label: 'Empty state',
  platforms: 'all',
  category: 'Feedback',
  keywords: ['no results', 'nothing', 'blank', 'zero', 'filler'],
  props: {
    icon: { type: 'icon', label: 'Icon', default: 'lucide:Inbox' },
    title: { type: 'text', label: 'Title', default: 'Nothing here yet' },
    message: { type: 'multiline', label: 'Message', default: 'Items you add will show up here.', placeholder: 'None' },
    buttonLabel: { type: 'text', label: 'Button', default: '', placeholder: 'No button', help: 'Leave empty for no button.' },
  },
  sizing: { width: 'fill', height: 'hug' },
  resizable: { height: true },
  defaultSize: { width: 342, height: 220 },
  build(p, { width, height }) {
    const cx = width / 2;
    const room = Math.max(0, Math.min(width, 320));
    let y = PAD;
    const out = [];
    if (p.icon) {
      out.push(icon(p.icon, { x: cx - ICON / 2, y, size: ICON, tone: 'inkMuted' }));
      y += ICON + WF_SPACE.lg;
    }
    if (p.title) {
      out.push(text(truncate(p.title, room, 'subheading'), { x: cx, y, style: 'subheading', align: 'center', name: 'Title' }));
      y += Math.ceil(lineHeight('subheading'));
    }
    if (p.message) {
      const lines = wrapLines(p.message, room, 'body');
      y += WF_SPACE.sm;
      out.push(text(lines.join('\n'), { x: cx, y, tone: 'inkMuted', align: 'center', name: 'Message' }));
      y += Math.ceil(lines.length * lineHeight('body'));
    }
    if (p.buttonLabel) {
      y += WF_SPACE.xl;
      const b = button.build({ label: p.buttonLabel, variant: 'primary', icon: '' }, { width: 0 });
      const w = Math.min(width, b.width ?? 120);
      const built = button.build({ label: p.buttonLabel, variant: 'primary', icon: '' }, { width: w });
      out.push(createGroup({ name: 'Button', transform: { x: cx - w / 2, y }, children: built.children }));
      y += built.height;
    }
    const natural = Math.ceil(y + PAD);
    const h = Math.max(natural, Math.ceil(height ?? 0));
    // Taller box: the content stays together, centred vertically.
    const dy = Math.round((h - natural) / 2);
    return { children: dy > 0 ? [createGroup({ name: 'Content', transform: { x: 0, y: dy }, children: nodes(...out) })] : nodes(...out), height: h };
  },
  describe(p) {
    const parts = ['Empty state'];
    if (p.icon) parts.push(`icon ${iconDisplayName(p.icon)}`);
    if (p.title) parts.push(`title "${p.title}"`);
    if (p.message) parts.push(`message "${p.message.replace(/\s*\n\s*/g, ' ')}"`);
    parts.push(p.buttonLabel ? `button "${p.buttonLabel}"` : 'no button');
    return parts.join(', ');
  },
});
