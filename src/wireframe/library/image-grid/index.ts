// Image grid: a gallery of square image placeholders, 2–4 columns, any number of rows.
import { imagePlaceholder, part } from '../../kit';
import { defineComponent } from '../types';

export default defineComponent({
  kind: 'image-grid',
  label: 'Image grid',
  platforms: ['phone', 'tablet'],
  category: 'Media',
  keywords: ['gallery', 'photos', 'thumbnails', 'grid', 'images'],
  props: {
    columns: { type: 'number', label: 'Columns', default: 3, min: 2, max: 4, step: 1 },
    rows: { type: 'number', label: 'Rows', default: 2, min: 1, max: 8, step: 1 },
    gap: { type: 'number', label: 'Gap', default: 4, min: 0, max: 24, step: 2, unit: 'px' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 228 },
  build(p, { width, height }) {
    const cols = Math.max(2, Math.min(4, Math.round(p.columns)));
    const rows = Math.max(1, Math.min(8, Math.round(p.rows)));
    const gap = Math.max(0, p.gap);
    const cellW = Math.max(1, (width - gap * (cols - 1)) / cols);
    // Square cells, unless the height is fixed: then the rows share it.
    const cellH = height !== undefined ? Math.max(1, (height - gap * (rows - 1)) / rows) : cellW;
    const cells = Array.from({ length: cols * rows }, (_, i) =>
      imagePlaceholder({ x: (i % cols) * (cellW + gap), y: Math.floor(i / cols) * (cellH + gap), width: cellW, height: cellH, name: `Image ${i + 1}` }),
    );
    return { children: [part('Images', cells)], height: height ?? rows * cellH + (rows - 1) * gap };
  },
  describe: (p) => `Image grid, ${Math.round(p.columns)} columns × ${Math.round(p.rows)} rows (${Math.round(p.columns) * Math.round(p.rows)} images), gap ${p.gap}px`,
});
