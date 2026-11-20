// Pagination: previous, a window of page numbers with ellipses, next. The current page is filled.
import { box, chevron, rect, textInBand } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import type { SceneNode } from '@/model';
import { defineComponent } from '../types';

const SIZE = 36;
const GAP = WF_SPACE.xs;

/** The entries to show: always the first and last page, the current one and its neighbours, `…` for gaps. */
export function pageItems(pages: number, current: number): (number | '…')[] {
  const last = Math.max(1, Math.round(pages));
  const cur = Math.min(last, Math.max(1, Math.round(current)));
  const wanted = new Set([1, last, cur - 1, cur, cur + 1].filter((n) => n >= 1 && n <= last));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev === 2) out.push(n - 1);
    else if (prev !== undefined && n - prev > 2) out.push('…');
    out.push(n);
  });
  return out;
}

export default defineComponent({
  kind: 'pagination',
  label: 'Pagination',
  platforms: ['desktop', 'tablet'],
  category: 'Navigation',
  keywords: ['pager', 'pages', 'next', 'previous'],
  props: {
    pages: { type: 'number', label: 'Pages', default: 10, min: 1, max: 999 },
    current: { type: 'number', label: 'Current page', default: 1, min: 1, max: 999 },
    align: { type: 'choice', label: 'Align', options: ['left', 'center', 'right'], default: 'center' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 480, height: SIZE },
  build(p, { width }) {
    const cur = Math.min(Math.round(p.pages), Math.max(1, Math.round(p.current)));
    const items = pageItems(p.pages, cur);
    const count = items.length + 2;
    const total = count * SIZE + (count - 1) * GAP;
    let x = p.align === 'left' ? 0 : p.align === 'right' ? width - total : (width - total) / 2;
    const children: SceneNode[] = [];
    const slot = (draw: (x: number) => void) => {
      draw(x);
      x += SIZE + GAP;
    };
    const cell = (x0: number, on: boolean) => box({ x: x0, y: 0, width: SIZE, height: SIZE, radius: WF_RADIUS.md, fill: on ? 'ink' : 'paper', stroke: on ? 'none' : 'line', name: on ? 'Current page' : 'Page' });
    slot((x0) => children.push(cell(x0, false), chevron({ x: x0 + (SIZE - 20) / 2, y: (SIZE - 20) / 2, direction: 'left', tone: cur > 1 ? 'ink' : 'line' })));
    for (const it of items) {
      slot((x0) => {
        if (it === '…') children.push(textInBand('…', { x: x0 + SIZE / 2, y: 0, height: SIZE, align: 'center', style: 'label', tone: 'inkMuted', name: 'Gap' }));
        else children.push(cell(x0, it === cur), textInBand(String(it), { x: x0 + SIZE / 2, y: 0, height: SIZE, align: 'center', style: 'label', weight: it === cur ? 600 : 500, tone: it === cur ? 'paper' : 'ink', name: 'Page number' }));
      });
    }
    slot((x0) => children.push(cell(x0, false), chevron({ x: x0 + (SIZE - 20) / 2, y: (SIZE - 20) / 2, tone: cur < p.pages ? 'ink' : 'line' })));
    return { children, height: SIZE };
  },
  parts(p, { width }) {
    const cur = Math.min(Math.round(p.pages), Math.max(1, Math.round(p.current)));
    const count = pageItems(p.pages, cur).length + 2;
    const total = count * SIZE + (count - 1) * GAP;
    const x = p.align === 'left' ? 0 : p.align === 'right' ? width - total : (width - total) / 2;
    return [
      { key: 'previous', label: 'Previous', rect: rect(x, 0, SIZE, SIZE) },
      { key: 'next', label: 'Next', rect: rect(x + total - SIZE, 0, SIZE, SIZE) },
    ];
  },
  describe: (p) => `Pagination: page ${Math.min(Math.round(p.pages), Math.max(1, Math.round(p.current)))} of ${Math.round(p.pages)}`,
});
