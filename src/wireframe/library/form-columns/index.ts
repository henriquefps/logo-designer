// Form in columns: a grid of fields, each a real label over an empty input box. Fields fill the grid row by row.
import { box, textInBand, truncate, lineHeight } from '../../kit';
import { WF_RADIUS, WF_SIZE, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const COL_GAP = WF_SPACE.xl;
const ROW_GAP = WF_SPACE.lg;
const LABEL_H = lineHeight('label');
const CELL_H = Math.ceil(LABEL_H) + WF_SPACE.sm + WF_SIZE.control;

export default defineComponent({
  kind: 'form-columns',
  label: 'Form in columns',
  platforms: ['desktop', 'tablet'],
  category: 'Forms',
  keywords: ['fields', 'inputs', 'grid form', 'two columns', 'settings form'],
  props: {
    columns: { type: 'number', label: 'Columns', default: 2, min: 1, max: 3 },
    fields: { type: 'list', label: 'Fields', item: 'Field', default: ['First name', 'Last name', 'Email', 'Phone'], min: 1, max: 24, help: 'Label of each input, in reading order.' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 640, height: CELL_H * 2 + ROW_GAP },
  build(p, { width }) {
    const cols = Math.min(3, Math.max(1, Math.round(p.columns)));
    const rows = Math.ceil(p.fields.length / cols);
    const cw = Math.max(0, (width - COL_GAP * (cols - 1)) / cols);
    const children = p.fields.flatMap((label, i) => {
      const x = (i % cols) * (cw + COL_GAP);
      const y = Math.floor(i / cols) * (CELL_H + ROW_GAP);
      return [
        textInBand(truncate(label, cw, 'label'), { x, y, height: Math.ceil(LABEL_H), style: 'label', name: 'Label' }),
        box({ x, y: y + Math.ceil(LABEL_H) + WF_SPACE.sm, width: cw, height: WF_SIZE.control, radius: WF_RADIUS.md, fill: 'paper', stroke: 'line', name: 'Input' }),
      ];
    });
    return { children, height: rows * CELL_H + (rows - 1) * ROW_GAP };
  },
  describe: (p) => `Form in ${Math.round(p.columns)} column${Math.round(p.columns) === 1 ? '' : 's'}: fields ${p.fields.join(', ')}`,
});
