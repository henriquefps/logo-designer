// Bottom sheet: a panel rising from the bottom edge with a grab handle, a title and a list of rows.
// Free, anchored at the bottom of the screen, edge to edge.
import { box, divider, lineHeight, nodes, part, textInBand, truncate } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const ROW = 56;
const PAD = WF_SPACE.lg;
const TOP = 28; // handle area
const BOTTOM = 24; // home indicator room
const MAX = 8;

export default defineComponent({
  kind: 'bottom-sheet',
  label: 'Bottom sheet',
  platforms: ['phone', 'tablet'],
  category: 'Overlays',
  keywords: ['sheet', 'drawer', 'modal', 'actions', 'share'],
  props: {
    title: { type: 'text', label: 'Title', default: 'Title', placeholder: 'None' },
    rows: { type: 'list', label: 'Rows', default: ['Copy link', 'Send as message', 'More options'], item: 'Row', min: 1, max: MAX },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  resizable: { height: true },
  defaultSize: { width: 390, height: TOP + 32 + ROW * 3 + BOTTOM },
  placement: { position: 'free', anchor: 'bottom-edge' },
  build(p, { width, height }) {
    const rows = p.rows.slice(0, MAX);
    const titleH = p.title ? Math.ceil(lineHeight('subheading')) + WF_SPACE.md : 0;
    // Taller sheet: the handle, title and rows stay on top.
    const h = Math.max(TOP + titleH + rows.length * ROW + BOTTOM, Math.ceil(height ?? 0));
    const y0 = TOP + titleH;
    return {
      children: nodes(
        box({ x: 0, y: 0, width, height: h, radius: WF_RADIUS.lg, fill: 'paper', stroke: 'line', name: 'Sheet' }),
        box({ x: width / 2 - 18, y: 10, width: 36, height: 4, radius: WF_RADIUS.pill, fill: 'line', stroke: 'none', name: 'Handle' }),
        p.title && textInBand(truncate(p.title, width - PAD * 2, 'subheading'), { x: PAD, y: TOP, height: Math.ceil(lineHeight('subheading')), style: 'subheading', name: 'Title' }),
        part('Rows', rows.flatMap((r, i) => nodes(
          textInBand(truncate(r, width - PAD * 2, 'body'), { x: PAD, y: y0 + i * ROW, height: ROW, name: `Row ${i + 1}` }),
          i < rows.length - 1 && divider({ x: PAD, y: y0 + (i + 1) * ROW - 0.5, width: Math.max(0, width - PAD) }),
        ))),
      ),
      height: h,
    };
  },
  describe: (p) => `Bottom sheet${p.title ? ` "${p.title}"` : ''}: ${p.rows.slice(0, MAX).join(', ')}`,
});
