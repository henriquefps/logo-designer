// Cards grid: N columns × N rows of cards (placeholders: an image or text bars). For galleries, dashboards and listings.
import { box, imagePlaceholder, textBars, textBarsHeight } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const GAP = WF_SPACE.xl;
const PAD = WF_SPACE.lg;
const SIDE_IMAGE = 96;

export default defineComponent({
  kind: 'cards-grid',
  label: 'Cards grid',
  platforms: ['desktop', 'tablet'],
  category: 'Layout',
  keywords: ['gallery', 'tiles', 'cards', 'listing', 'grid'],
  props: {
    columns: { type: 'number', label: 'Columns', default: 3, min: 1, max: 6 },
    rows: { type: 'number', label: 'Rows', default: 2, min: 1, max: 8 },
    cardStyle: {
      type: 'choice',
      label: 'Card style',
      options: ['image', 'text', 'horizontal'],
      default: 'image',
      labels: { image: 'Image on top', text: 'Text only', horizontal: 'Image on the left' },
    },
  },
  sizing: { width: 'fill', height: 'hug' },
  resizable: { height: true },
  defaultSize: { width: 960, height: 520 },
  build(p, { width, height }) {
    const cols = Math.round(p.columns);
    const rows = Math.round(p.rows);
    const cw = Math.max(0, (width - GAP * (cols - 1)) / cols);
    const inner = Math.max(0, cw - PAD * 2);
    const img = Math.round((cw * 9) / 16);
    const titleH = textBarsHeight(1, 'subheading');
    const copyH = (lines: number) => titleH + WF_SPACE.sm + textBarsHeight(lines, 'label');
    const ch = p.cardStyle === 'image' ? img + PAD + copyH(2) + PAD : p.cardStyle === 'text' ? PAD + copyH(3) + PAD : PAD * 2 + Math.max(SIDE_IMAGE, copyH(3));
    // Taller grid: the rows share the height; each card's content stays at its top.
    const cardH = Math.max(Math.ceil(ch), Math.ceil(((height ?? 0) - GAP * (rows - 1)) / rows));
    const children = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * (cw + GAP);
        const y = r * (cardH + GAP);
        const card = [box({ x, y, width: cw, height: cardH, radius: WF_RADIUS.lg, fill: 'paper', stroke: 'line', name: 'Card' })];
        if (p.cardStyle === 'image') {
          card.push(imagePlaceholder({ x: x + 0.5, y: y + 0.5, width: Math.max(0, cw - 1), height: img - 1, radius: WF_RADIUS.lg, name: 'Card image' }));
          card.push(...copy(x + PAD, y + img + PAD, inner, 2));
        } else if (p.cardStyle === 'text') {
          card.push(...copy(x + PAD, y + PAD, inner, 3));
        } else {
          const iw = Math.min(SIDE_IMAGE, inner * 0.4);
          card.push(imagePlaceholder({ x: x + PAD, y: y + PAD, width: iw, height: SIDE_IMAGE, radius: WF_RADIUS.md, name: 'Card image' }));
          card.push(...copy(x + PAD + iw + WF_SPACE.lg, y + PAD, Math.max(0, inner - iw - WF_SPACE.lg), 3));
        }
        children.push(...card);
      }
    }
    return { children, height: rows * cardH + (rows - 1) * GAP };
  },
  describe: (p) => `Cards grid: ${Math.round(p.columns)} columns × ${Math.round(p.rows)} rows (${Math.round(p.columns) * Math.round(p.rows)} cards), ${{ image: 'image on top', text: 'text only', horizontal: 'image on the left' }[p.cardStyle]}`,
});

/** A card's copy: a title bar and `lines` lines of body bars. */
function copy(x: number, y: number, width: number, lines: number) {
  const titleH = textBarsHeight(1, 'subheading');
  return [textBars({ x, y, width: width * 0.6, lines: 1, style: 'subheading', name: 'Card title' }), textBars({ x, y: y + titleH + WF_SPACE.sm, width, lines, style: 'label', name: 'Card text' })];
}
