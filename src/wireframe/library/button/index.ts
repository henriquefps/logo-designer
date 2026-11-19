// Button: primary (filled), secondary (outlined) or text, with an optional icon before the label.
import { box, icon, nodes, textInBand, textWidth } from '../../kit';
import { iconDisplayName } from '../../icons';
import { WF_RADIUS, WF_SIZE, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.xl;
const GAP = WF_SPACE.sm;

export default defineComponent({
  kind: 'button',
  label: 'Button',
  platforms: 'all',
  category: 'Actions',
  keywords: ['cta', 'action', 'submit', 'link'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Button' },
    variant: {
      type: 'choice',
      label: 'Variant',
      options: ['primary', 'secondary', 'text'],
      default: 'primary',
      labels: { primary: 'Primary (filled)', secondary: 'Secondary (outlined)', text: 'Text' },
    },
    icon: { type: 'icon', label: 'Icon', default: '' },
  },
  sizing: { width: 'hug', height: 'hug' },
  defaultSize: { width: 120, height: WF_SIZE.control },
  build(props, { width }) {
    const h = WF_SIZE.control;
    const variant = props.variant;
    const labelW = props.label ? textWidth(props.label, 'label', 600) : 0;
    const iconW = props.icon ? WF_SIZE.icon : 0;
    const content = iconW + (iconW && labelW ? GAP : 0) + labelW;
    const intrinsic = Math.ceil(content + (variant === 'text' ? WF_SPACE.sm * 2 : PAD * 2));
    const start = (width - content) / 2;
    const tone = variant === 'primary' ? 'paper' : 'ink';
    const children = nodes(
      variant !== 'text' &&
        box({ x: 0, y: 0, width, height: h, radius: WF_RADIUS.md, fill: variant === 'primary' ? 'ink' : 'paper', stroke: variant === 'primary' ? 'none' : 'ink', name: 'Background' }),
      icon(props.icon, { x: start, y: (h - WF_SIZE.icon) / 2, tone }),
      props.label && textInBand(props.label, { x: start + iconW + (iconW ? GAP : 0), y: 0, height: h, style: 'label', weight: 600, tone, name: 'Label' }),
    );
    return { children, height: h, width: Math.max(intrinsic, h) };
  },
  describe: (props) => {
    const kind = props.variant === 'primary' ? 'Primary button' : props.variant === 'secondary' ? 'Secondary button' : 'Text button';
    return `${kind} "${props.label}"${props.icon ? ` with icon ${iconDisplayName(props.icon)}` : ''}`;
  },
});
