// List row: title, optional subtitle, something on the left (icon / avatar) and on the right
// (chevron / switch / value / checkbox). The building block of settings pages and lists.
import { avatar, checkbox, chevron, divider, icon, lineHeight, nodes, part, text, textWidth, toggle, truncate, TOGGLE } from '../../kit';
import { iconDisplayName } from '../../icons';
import { WF_SIZE, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.lg;
const GAP = WF_SPACE.lg;
const LEAD_ICON = 24;

export default defineComponent({
  kind: 'list-row',
  label: 'List row',
  platforms: ['phone', 'tablet'],
  category: 'Lists',
  keywords: ['row', 'item', 'cell', 'setting', 'menu'],
  props: {
    title: { type: 'text', label: 'Title', default: 'Title' },
    subtitle: { type: 'text', label: 'Subtitle', default: '', placeholder: 'None' },
    leading: { type: 'choice', label: 'Leading', options: ['none', 'icon', 'avatar'], default: 'none' },
    leadingIcon: { type: 'icon', label: 'Icon', default: 'lucide:Star', visibleWhen: { leading: 'icon' } },
    trailing: { type: 'choice', label: 'Trailing', options: ['none', 'chevron', 'toggle', 'value', 'checkbox'], default: 'chevron' },
    value: { type: 'text', label: 'Value', default: 'Value', visibleWhen: { trailing: 'value' } },
    checked: { type: 'boolean', label: 'On', default: true, visibleWhen: { trailing: ['toggle', 'checkbox'] } },
    divider: { type: 'boolean', label: 'Divider', default: false },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true }, // edge to edge: the row pads its own content
  defaultSize: { width: 390, height: WF_SIZE.row },
  build(p, { width }) {
    const h = p.subtitle ? WF_SIZE.rowTall : WF_SIZE.row;
    const mid = h / 2;

    // Left
    let left = PAD;
    let leading = null;
    if (p.leading === 'icon' && p.leadingIcon) {
      leading = icon(p.leadingIcon, { x: PAD, y: mid - LEAD_ICON / 2, size: LEAD_ICON, tone: 'inkMuted' });
      left += LEAD_ICON + GAP;
    } else if (p.leading === 'avatar') {
      leading = avatar({ x: PAD, y: mid - WF_SIZE.avatar / 2 });
      left += WF_SIZE.avatar + GAP;
    }

    // Right
    let right = width - PAD;
    let trailing = null;
    switch (p.trailing) {
      case 'chevron':
        trailing = chevron({ x: right - WF_SIZE.icon, y: mid - WF_SIZE.icon / 2 });
        right -= WF_SIZE.icon + GAP;
        break;
      case 'toggle':
        trailing = toggle({ x: right - TOGGLE.width, y: mid - TOGGLE.height / 2, on: p.checked });
        right -= TOGGLE.width + GAP;
        break;
      case 'checkbox':
        trailing = checkbox({ x: right - 20, y: mid - 10, checked: p.checked });
        right -= 20 + GAP;
        break;
      case 'value': {
        // The value may take up to half the row; the title gets the rest.
        const value = truncate(p.value, Math.max(0, (width - left - PAD) / 2), 'body');
        if (value) {
          trailing = text(value, { x: right, y: mid - lineHeight('body') / 2, align: 'right', tone: 'inkMuted', name: 'Value' });
          right -= textWidth(value, 'body') + GAP;
        }
        break;
      }
    }

    // Middle
    const room = Math.max(0, right - left);
    const titleH = lineHeight('body');
    const subH = lineHeight('label');
    const top = p.subtitle ? mid - (titleH + 2 + subH) / 2 : mid - titleH / 2;
    const children = nodes(
      leading && part('Leading', [leading]),
      text(truncate(p.title, room, 'body'), { x: left, y: top, name: 'Title' }),
      p.subtitle && text(truncate(p.subtitle, room, 'label', 400), { x: left, y: top + titleH + 2, style: 'label', weight: 400, tone: 'inkMuted', name: 'Subtitle' }),
      trailing && part('Trailing', [trailing]),
      p.divider && divider({ x: left, y: h - 0.5, width: width - left }),
    );
    return { children, height: h };
  },
  describe(p) {
    const parts = [`List row "${p.title}"`];
    if (p.subtitle) parts.push(`subtitle "${p.subtitle}"`);
    if (p.leading === 'icon' && p.leadingIcon) parts.push(`leading icon ${iconDisplayName(p.leadingIcon)}`);
    if (p.leading === 'avatar') parts.push('leading avatar');
    if (p.trailing === 'chevron') parts.push('→ chevron (opens a screen)');
    if (p.trailing === 'value') parts.push(`→ value "${p.value}"`);
    if (p.trailing === 'toggle') parts.push(`→ toggle (${p.checked ? 'on' : 'off'})`);
    if (p.trailing === 'checkbox') parts.push(`→ checkbox (${p.checked ? 'checked' : 'unchecked'})`);
    return parts.join(', ');
  },
});
