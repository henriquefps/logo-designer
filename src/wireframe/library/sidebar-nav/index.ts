// Sidebar navigation: a fixed-width column of items (optionally with icons and section labels), one selected.
// In a desktop screen it is the first child of a horizontal stack, beside a vertical stack of content.
import { box, describeItems, divider, iconSlot, itemKey, keyIndex, nodes, rect, textInBand, truncate } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.md;
const ITEM_H = 40;
const SECTION_H = 36;
const TOP = WF_SPACE.lg;

/** Entries starting with `#` are section labels; the others are items. */
export const isSidebarSection = (entry: string) => entry.trim().startsWith('#');
const sectionText = (entry: string) => entry.trim().replace(/^#+\s*/, '');

interface Row {
  kind: 'section' | 'item';
  /** Index in `items` (the part key's index). */
  index: number;
  /** Items only: 1-based position among the items (what `selected` counts). */
  n: number;
  y: number;
  entry: string;
}

/** Where the title, section labels and items go (shared by `build` and `parts`). */
function rows(p: { title: string; items: string[] }): { rows: Row[]; bottom: number } {
  const out: Row[] = [];
  let y = TOP;
  if (p.title) y += ITEM_H + WF_SPACE.sm;
  let n = 0;
  p.items.forEach((entry, index) => {
    if (isSidebarSection(entry)) {
      y += n > 0 || p.title ? WF_SPACE.sm : 0;
      out.push({ kind: 'section', index, n: 0, y, entry });
      y += SECTION_H;
      return;
    }
    n += 1;
    out.push({ kind: 'item', index, n, y, entry });
    y += ITEM_H + 2;
  });
  return { rows: out, bottom: y };
}

/** The selected position among the items (1-based). */
const selectedOf = (p: { items: string[]; selected: number }) => Math.min(p.selected, Math.max(1, p.items.filter((e) => !isSidebarSection(e)).length));

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
    selected: { type: 'number', label: 'Selected item', help: 'Position among the items (not the labels), starting at 1. Follows the screen: the item that opens the screen on show.', default: 1, min: 1, max: 20, auto: { label: 'Follows the screen', default: true } },
    icons: { type: 'boolean', label: 'Icons', default: true },
  },
  sizing: { width: 240, height: 'fill' },
  resizable: { height: true },
  defaultSize: { width: 240, height: 640 },
  build(p, { width, height }) {
    const sel = selectedOf(p);
    const children = [];
    if (p.title) children.push(textInBand(truncate(p.title, width - PAD * 2 - 8, 'subheading'), { x: PAD + 8, y: TOP, height: ITEM_H, style: 'subheading', name: 'Title' }));
    const layout = rows(p);
    for (const r of layout.rows) {
      if (r.kind === 'section') {
        children.push(textInBand(truncate(sectionText(r.entry).toUpperCase(), width - PAD * 2 - 16, 'caption', 600), { x: PAD + 8, y: r.y, height: SECTION_H, style: 'caption', weight: 600, tone: 'inkMuted', name: 'Section label' }));
        continue;
      }
      const on = r.n === sel;
      const labelX = PAD + 12 + (p.icons ? 18 + WF_SPACE.md : 0);
      children.push(
        ...nodes(
          on && box({ x: PAD, y: r.y, width: Math.max(0, width - PAD * 2), height: ITEM_H, radius: WF_RADIUS.md, fill: 'fill', stroke: 'none', name: 'Selected background' }),
          p.icons && iconSlot({ x: PAD + 12, y: r.y + (ITEM_H - 18) / 2, tone: on ? 'line' : 'fill' }),
          textInBand(truncate(r.entry, width - PAD - 8 - labelX, 'label', on ? 600 : 500), { x: labelX, y: r.y, height: ITEM_H, style: 'label', weight: on ? 600 : 500, tone: on ? 'ink' : 'inkMuted', name: on ? 'Item (selected)' : 'Item' }),
        ),
      );
    }
    const h = Math.max(height ?? 0, Math.ceil(layout.bottom + TOP));
    return {
      children: [box({ x: 0, y: 0, width, height: h, fill: 'surface', stroke: 'none', name: 'Background' }), ...children, divider({ x: width - 0.5, y: 0, width: h, vertical: true })],
      height: h,
    };
  },
  parts(p, { width }) {
    return rows(p)
      .rows.filter((r) => r.kind === 'item')
      .map((r) => ({ key: itemKey(r.index), label: r.entry.trim(), rect: rect(PAD, r.y, width - PAD * 2, ITEM_H) }));
  },
  partLists: { item: 'items' },
  selectFromPart(p, key) {
    const i = keyIndex(key);
    const r = i === null ? undefined : rows(p).rows.find((x) => x.index === i);
    return r?.kind === 'item' ? r.n : null;
  },
  describe(p, opens) {
    const parts = ['Sidebar navigation'];
    if (p.title) parts.push(`title "${p.title}"`);
    const items = p.items.filter((e) => !isSidebarSection(e));
    const sections = p.items.filter(isSidebarSection).map(sectionText);
    const sel = selectedOf(p);
    const list = rows(p).rows.filter((r) => r.kind === 'item').map((r) => ({ key: itemKey(r.index), label: r.entry, selected: r.n === sel }));
    if (list.some((it) => opens?.has(it.key))) parts.push(`items ${describeItems(list, opens)}`);
    else parts.push(`items ${items.join(', ')} (${items[sel - 1] ?? 'none'} selected)`);
    if (sections.length) parts.push(`section labels ${sections.join(', ')}`);
    if (p.icons) parts.push('with icons');
    return parts.join('; ');
  },
});


