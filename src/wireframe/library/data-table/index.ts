// Data table: a header row with real column labels, body cells as grey bars, optional checkbox column and row actions.
import { box, checkbox, circle, divider, part, textBars, textInBand, truncate } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

export const HEADER_H = 44;
export const ROW_H = 48;
const SIDE = 48;

/** Fraction of a cell the grey bar takes: varies by position so rows do not look stamped (deterministic). */
const barFraction = (row: number, col: number) => [0.7, 0.5, 0.85, 0.6, 0.4][(row * 3 + col * 2) % 5];

export default defineComponent({
  kind: 'data-table',
  label: 'Data table',
  platforms: ['desktop', 'tablet'],
  category: 'Data',
  keywords: ['table', 'grid', 'list', 'rows', 'columns', 'records'],
  props: {
    columns: { type: 'list', label: 'Columns', item: 'Column', default: ['Name', 'Size', 'Modified'], min: 1, max: 8 },
    rows: { type: 'number', label: 'Rows', default: 8, min: 1, max: 50 },
    selectable: { type: 'boolean', label: 'Checkbox column', default: false },
    rowActions: { type: 'boolean', label: 'Row actions', default: false },
  },
  sizing: { width: 'fill', height: 'hug' },
  resizable: { height: true },
  defaultSize: { width: 800, height: HEADER_H + ROW_H * 8 },
  build(p, { width, height }) {
    const rows = Math.max(1, Math.round(p.rows));
    // Taller table: the extra room is empty rows (lines only) below the ones with content.
    const h = Math.max(HEADER_H + rows * ROW_H, Math.ceil(height ?? 0));
    const drawn = Math.max(rows, Math.floor((h - HEADER_H) / ROW_H));
    const left = p.selectable ? SIDE : 0;
    const right = p.rowActions ? SIDE : 0;
    const cols = p.columns.length;
    const cw = Math.max(0, (width - left - right) / cols);
    const pad = WF_SPACE.lg;
    const children = [
      box({ x: 0, y: 0, width, height: h, radius: WF_RADIUS.md, fill: 'paper', stroke: 'line', name: 'Table' }),
      box({ x: 0.5, y: 0.5, width: Math.max(0, width - 1), height: HEADER_H, radius: WF_RADIUS.md, fill: 'surface', stroke: 'none', name: 'Header background' }),
    ];
    const header = [];
    if (p.selectable) header.push(checkbox({ x: (SIDE - 20) / 2, y: (HEADER_H - 20) / 2, checked: false }));
    p.columns.forEach((c, i) => header.push(textInBand(truncate(c, cw - pad * 2, 'label', 600), { x: left + i * cw + pad, y: 0, height: HEADER_H, style: 'label', weight: 600, name: 'Column' })));
    children.push(part('Header', header));
    for (let r = 0; r < drawn; r++) {
      const y = HEADER_H + r * ROW_H;
      const cells = [divider({ x: 0, y, width })];
      if (r >= rows) {
        children.push(part(`Row ${r + 1} (empty)`, cells));
        continue;
      }
      if (p.selectable) cells.push(checkbox({ x: (SIDE - 20) / 2, y: y + (ROW_H - 20) / 2, checked: false }));
      p.columns.forEach((_, c) => {
        const w = (cw - pad * 2) * barFraction(r, c);
        if (w >= 4) cells.push(textBars({ x: left + c * cw + pad, y: y + (ROW_H - 20) / 2, width: w, lines: 1, style: 'label', name: 'Cell' }));
      });
      if (p.rowActions) {
        const cx = width - SIDE / 2;
        for (const dy of [-5, 0, 5]) cells.push(circle({ x: cx - 1.5, y: y + ROW_H / 2 + dy - 1.5, size: 3, fill: 'inkMuted', name: 'Dot' }));
      }
      children.push(part(`Row ${r + 1}`, cells));
    }
    return { children, height: h };
  },
  describe(p) {
    const parts = [`Data table: columns ${p.columns.join(', ')}`, `${Math.round(p.rows)} rows`];
    if (p.selectable) parts.push('checkbox column');
    if (p.rowActions) parts.push('row actions');
    return parts.join('; ');
  },
});
