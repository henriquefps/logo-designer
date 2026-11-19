// Sidebar navigation: a fixed-width column of items (optionally with icons and section labels), one selected.
// In a desktop screen it is the first child of a horizontal stack, beside a vertical stack of content.
import { box, divider, iconSlot, nodes, textInBand, truncate } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.md;
const ITEM_H = 40;
const SECTION_H = 36;
const TOP = WF_SPACE.lg;

/** Entries starting with `#` are section labels; the others are items. */
export const isSidebarSection = (entry: string) => entry.trim().startsWith('#');
const sectionText = (entry: string) => entry.trim().replace(/^#+\s*/, '');

export default defineComponent({
  kind: 'sidebar-nav',
  label: 'Sidebar navigation',
  platforms: ['desktop', 'tablet'],
  category: 'Navigation',
  keywords: ['side menu', 'drawer', 'navigation', 'left menu'],
  props: {
    title: { type: 'text', label: 'Title', default: '', placeholder: 'None', help: 'App or section name above the items.' },
    items: {
      type: 'list',
      label: 'Items',
      item: 'Item',
      default: ['Dashboard', 'Projects', 'Team', 'Settings'],
      min: 1,
      max: 20,
      help: 'Start an entry with # to make it a section label.',
    },
    selected: { type: 'number', label: 'Selected item', help: 'Position among the items (not the labels), starting at 1.', default: 1, min: 1, max: 20 },
    icons: { type: 'boolean', label: 'Icons', default: true },
  },
  sizing: { width: 240, height: 'fill' },
  resizable: { height: true },
  defaultSize: { width: 240, height: 640 },
  build(p, { width, height }) {
    const itemCount = p.items.filter((e) => !isSidebarSection(e)).length;
    const sel = Math.min(p.selected, Math.max(1, itemCount));
    const children = [];
    let y = TOP;
    if (p.title) {
      children.push(textInBand(truncate(p.title, width - PAD * 2 - 8, 'subheading'), { x: PAD + 8, y, height: ITEM_H, style: 'subheading', name: 'Title' }));
      y += ITEM_H + WF_SPACE.sm;
    }
    let n = 0;
    for (const entry of p.items) {
      if (isSidebarSection(entry)) {
        y += n > 0 || p.title ? WF_SPACE.sm : 0;
        children.push(textInBand(truncate(sectionText(entry).toUpperCase(), width - PAD * 2 - 16, 'caption', 600), { x: PAD + 8, y, height: SECTION_H, style: 'caption', weight: 600, tone: 'inkMuted', name: 'Section label' }));
        y += SECTION_H;
        continue;
      }
      n += 1;
      const on = n === sel;
      const labelX = PAD + 12 + (p.icons ? 18 + WF_SPACE.md : 0);
      children.push(
        ...nodes(
          on && box({ x: PAD, y, width: Math.max(0, width - PAD * 2), height: ITEM_H, radius: WF_RADIUS.md, fill: 'fill', stroke: 'none', name: 'Selected background' }),
          p.icons && iconSlot({ x: PAD + 12, y: y + (ITEM_H - 18) / 2, tone: on ? 'line' : 'fill' }),
          textInBand(truncate(entry, width - PAD - 8 - labelX, 'label', on ? 600 : 500), { x: labelX, y, height: ITEM_H, style: 'label', weight: on ? 600 : 500, tone: on ? 'ink' : 'inkMuted', name: on ? 'Item (selected)' : 'Item' }),
        ),
      );
      y += ITEM_H + 2;
    }
    const h = Math.max(height ?? 0, Math.ceil(y + TOP));
    return {
      children: [box({ x: 0, y: 0, width, height: h, fill: 'surface', stroke: 'none', name: 'Background' }), ...children, divider({ x: width - 0.5, y: 0, width: h, vertical: true })],
      height: h,
    };
  },
  describe(p) {
    const parts = ['Sidebar navigation'];
    if (p.title) parts.push(`title "${p.title}"`);
    const items = p.items.filter((e) => !isSidebarSection(e));
    const sections = p.items.filter(isSidebarSection).map(sectionText);
    parts.push(`items ${items.join(', ')} (${items[Math.min(p.selected, items.length) - 1] ?? 'none'} selected)`);
    if (sections.length) parts.push(`section labels ${sections.join(', ')}`);
    if (p.icons) parts.push('with icons');
    return parts.join('; ');
  },
});


