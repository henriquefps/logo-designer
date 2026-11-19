// Select: label above a dropdown showing the current value (or a placeholder) and a chevron. The options
// are not drawn (the menu is closed); they are listed for the AI export.
import { chevron, nodes } from '../../kit';
import { WF_SIZE } from '../../style';
import { defineComponent } from '../types';
import { errorBadge, fieldBox, fieldHelper, fieldLabel, fieldText, FIELD_PAD, FIELD_STATES, helperBlock, labelBlock, type FieldState } from '../common';

export default defineComponent({
  kind: 'select',
  label: 'Select',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['dropdown', 'picker', 'combobox', 'menu', 'choose', 'form'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Label', placeholder: 'None' },
    value: { type: 'text', label: 'Selected value', default: '', help: 'Empty shows the placeholder.' },
    placeholder: { type: 'text', label: 'Placeholder', default: 'Select an option' },
    options: { type: 'list', label: 'Options', default: ['Option 1', 'Option 2', 'Option 3'], item: 'Option', min: 0, max: 30, help: 'Not drawn (the menu is closed); read by the AI export.' },
    state: { type: 'choice', label: 'State', options: FIELD_STATES, default: 'normal' },
    helper: { type: 'text', label: 'Helper text', default: '', placeholder: 'None', visibleWhen: { state: ['normal', 'focused'] } },
    error: { type: 'text', label: 'Error text', default: 'Choose an option', visibleWhen: { state: 'error' } },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 70 },
  build(p, { width }) {
    const state = p.state as FieldState;
    const helper = state === 'error' ? p.error : p.helper;
    const top = labelBlock(p.label);
    const h = WF_SIZE.control;
    const chevronX = width - FIELD_PAD - WF_SIZE.icon;
    const right = chevronX - 8 - (state === 'error' ? 26 : 0);
    const content = fieldText({ value: p.value, placeholder: p.placeholder, x: FIELD_PAD, y: top, height: h, room: right - FIELD_PAD, focused: false });
    const children = nodes(
      fieldLabel(p.label, width),
      fieldBox({ y: top, width, height: h, state }),
      ...content.nodes,
      ...(state === 'error' ? errorBadge({ right: chevronX - 8, y: top, height: h }) : []),
      chevron({ x: chevronX, y: top + (h - WF_SIZE.icon) / 2, direction: 'down', tone: 'ink' }),
      fieldHelper(helper, top + h, width, state),
    );
    return { children, height: top + h + helperBlock(helper) };
  },
  describe(p) {
    const parts = [`Select "${p.label}"`];
    parts.push(p.value ? `value "${p.value}"` : `placeholder "${p.placeholder}"`);
    if (p.options.length) parts.push(`options: ${p.options.map((o: string) => `"${o}"`).join(', ')}`);
    if (p.state === 'focused') parts.push('focused');
    if (p.state === 'error') parts.push(`error "${p.error}"`);
    else if (p.helper) parts.push(`helper "${p.helper}"`);
    return parts.join(', ');
  },
});
