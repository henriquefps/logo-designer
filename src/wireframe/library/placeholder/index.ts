// Placeholder box: a grey box with an X and a label. The trivial stand-in that proves the
// materialization pipeline (its label prop rebuilds its children); the component system
// workstream may keep it, restyle it or replace it.
import { createPath, createRect, createText, defaultStroke, none, solid, type SceneNode } from '@/model';
import { WF } from '../../style';
import { defineComponent } from '../types';

export default defineComponent({
  kind: 'placeholder',
  label: 'Placeholder',
  platforms: 'all',
  category: 'Common',
  props: {
    label: { type: 'text', label: 'Label', default: 'Placeholder' },
    height: { type: 'number', label: 'Height', default: 120, min: 16, max: 4000, step: 8 },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 120 },
  build(props, { width }) {
    const h = props.height;
    const line = defaultStroke(solid(WF.line), WF.strokeWidth);
    const box = createRect({ name: 'Box', width, height: h, transform: { x: width / 2, y: h / 2 }, fill: solid(WF.fill), stroke: line });
    const cross = createPath({
      name: 'Cross',
      fill: none(),
      stroke: line,
      subpaths: [
        { closed: false, points: [{ x: 0, y: 0, type: 'corner' }, { x: width, y: h, type: 'corner' }] },
        { closed: false, points: [{ x: width, y: 0, type: 'corner' }, { x: 0, y: h, type: 'corner' }] },
      ],
    });
    const children: SceneNode[] = [box, cross];
    if (props.label) {
      const fontSize = 14;
      children.push(
        createText({
          name: 'Label',
          text: props.label,
          fontFamily: WF.font,
          fontSize,
          fontWeight: 500,
          align: 'center',
          lineHeight: 1.2,
          fill: solid(WF.ink),
          transform: { x: width / 2, y: h / 2 - (fontSize * 1.2) / 2 },
        }),
      );
    }
    return { children, height: h };
  },
  describe: (props) => `Placeholder "${props.label}"`,
});
