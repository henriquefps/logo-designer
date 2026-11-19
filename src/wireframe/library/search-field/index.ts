// Search field: a pill with a magnifier, the placeholder (or the typed text) and a clear button when there is text.
import { circle, nodes, polyline } from '../../kit';
import { WF_SIZE } from '../../style';
import { defineComponent } from '../types';
import { fieldBox, fieldText } from '../common';

export default defineComponent({
  kind: 'search-field',
  label: 'Search field',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['find', 'query', 'filter', 'magnifier', 'input'],
  props: {
    placeholder: { type: 'text', label: 'Placeholder', default: 'Search' },
    value: { type: 'text', label: 'Value', default: '', help: 'Text already typed in. Empty shows the placeholder.' },
    focused: { type: 'boolean', label: 'Focused', default: false },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: WF_SIZE.control },
  build(p, { width }) {
    const h = WF_SIZE.control;
    const lensX = 14;
    const lens = 12;
    const lensY = h / 2 - lens / 2 - 1;
    const hasClear = !!p.value;
    const left = lensX + lens + 14;
    const right = width - 14 - (hasClear ? 20 : 0);
    const content = fieldText({ value: p.value, placeholder: p.placeholder, x: left, y: 0, height: h, room: right - left, focused: p.focused });
    const cx = width - 14 - 10;
    const c = 4;
    const children = nodes(
      fieldBox({ y: 0, width, height: h, state: p.focused ? 'focused' : 'normal', radius: 9999, fill: 'surface' }),
      circle({ x: lensX, y: lensY, size: lens, fill: 'none', stroke: 'inkMuted', name: 'Lens' }),
      polyline([{ x: lensX + lens - 1.5, y: lensY + lens - 1.5 }, { x: lensX + lens + 4, y: lensY + lens + 4 }], { stroke: 'inkMuted', width: 1.5, name: 'Handle' }),
      ...content.nodes,
      ...(hasClear
        ? [
            polyline([{ x: cx - c, y: h / 2 - c }, { x: cx + c, y: h / 2 + c }], { stroke: 'inkMuted', width: 1.5, name: 'Clear' }),
            polyline([{ x: cx + c, y: h / 2 - c }, { x: cx - c, y: h / 2 + c }], { stroke: 'inkMuted', width: 1.5, name: 'Clear' }),
          ]
        : []),
    );
    return { children, height: h };
  },
  describe: (p) => `Search field, ${p.value ? `text "${p.value}"` : `placeholder "${p.placeholder}"`}${p.focused ? ', focused' : ''}`,
});
