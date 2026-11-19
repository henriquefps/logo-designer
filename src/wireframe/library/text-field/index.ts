// Text field: label above a one-line input, with placeholder or value, an optional leading icon and
// helper or error text.
import { icon, nodes } from '../../kit';
import { iconDisplayName } from '../../icons';
import { WF_SIZE } from '../../style';
import { defineComponent } from '../types';
import { errorBadge, fieldBox, fieldHelper, fieldLabel, fieldText, FIELD_PAD, FIELD_STATES, helperBlock, labelBlock, type FieldState } from '../common';

const TYPES = ['text', 'email', 'password', 'number', 'phone', 'url'] as const;

export default defineComponent({
  kind: 'text-field',
  label: 'Text field',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['input', 'form', 'email', 'password', 'field', 'textbox'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Label', placeholder: 'None' },
    placeholder: { type: 'text', label: 'Placeholder', default: 'Placeholder' },
    value: { type: 'text', label: 'Value', default: '', help: 'Text already typed in. Empty shows the placeholder.' },
    inputType: { type: 'choice', label: 'Input type', options: TYPES, default: 'text', labels: { phone: 'Phone number', url: 'URL' } },
    icon: { type: 'icon', label: 'Leading icon', default: '' },
    state: { type: 'choice', label: 'State', options: FIELD_STATES, default: 'normal' },
    helper: { type: 'text', label: 'Helper text', default: '', placeholder: 'None', visibleWhen: { state: ['normal', 'focused'] } },
    error: { type: 'text', label: 'Error text', default: 'This field is required', visibleWhen: { state: 'error' } },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 70 },
  build(p, { width }) {
    const state = p.state as FieldState;
    const helper = state === 'error' ? p.error : p.helper;
    const top = labelBlock(p.label);
    const h = WF_SIZE.control;
    const leading = p.icon ? icon(p.icon, { x: FIELD_PAD, y: top + (h - WF_SIZE.icon) / 2, tone: 'inkMuted' }) : null;
    const left = FIELD_PAD + (leading ? WF_SIZE.icon + 8 : 0);
    const right = width - FIELD_PAD - (state === 'error' ? 18 + 8 : 0);
    const content = fieldText({ value: p.value, placeholder: p.placeholder, x: left, y: top, height: h, room: right - left, focused: state === 'focused', mask: p.inputType === 'password' });
    const children = nodes(
      fieldLabel(p.label, width),
      fieldBox({ y: top, width, height: h, state }),
      leading,
      ...content.nodes,
      ...(state === 'error' ? errorBadge({ right: width - FIELD_PAD, y: top, height: h }) : []),
      fieldHelper(helper, top + h, width, state),
    );
    return { children, height: top + h + helperBlock(helper) };
  },
  describe(p) {
    const parts = [`Text field "${p.label}"`];
    if (p.inputType !== 'text') parts.push(`type ${p.inputType === 'phone' ? 'phone number' : p.inputType}`);
    if (p.value) parts.push(`value "${p.value}"`);
    else if (p.placeholder) parts.push(`placeholder "${p.placeholder}"`);
    if (p.icon) parts.push(`leading icon ${iconDisplayName(p.icon)}`);
    if (p.state === 'focused') parts.push('focused');
    if (p.state === 'error') parts.push(`error "${p.error}"`);
    else if (p.helper) parts.push(`helper "${p.helper}"`);
    return parts.join(', ');
  },
});
