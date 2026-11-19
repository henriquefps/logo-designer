// Text area: label above a multi-line input, with placeholder or value, helper or error text.
import { lineHeight, nodes, polyline, text } from '../../kit';
import { defineComponent } from '../types';
import { errorBadge, fieldBox, fieldHelper, fieldLabel, FIELD_PAD, FIELD_STATES, helperBlock, labelBlock, wrapLines, type FieldState } from '../common';

export default defineComponent({
  kind: 'text-area',
  label: 'Text area',
  platforms: 'all',
  category: 'Inputs',
  keywords: ['multiline', 'textarea', 'comment', 'message', 'notes', 'input'],
  props: {
    label: { type: 'text', label: 'Label', default: 'Message', placeholder: 'None' },
    placeholder: { type: 'text', label: 'Placeholder', default: 'Write something…' },
    value: { type: 'multiline', label: 'Value', default: '', help: 'Text already typed in. Empty shows the placeholder.' },
    rows: { type: 'number', label: 'Rows', default: 4, min: 2, max: 12, step: 1 },
    state: { type: 'choice', label: 'State', options: FIELD_STATES, default: 'normal' },
    helper: { type: 'text', label: 'Helper text', default: '', placeholder: 'None', visibleWhen: { state: ['normal', 'focused'] } },
    error: { type: 'text', label: 'Error text', default: 'This field is required', visibleWhen: { state: 'error' } },
  },
  sizing: { width: 'fill', height: 'hug' },
  resizable: { height: true },
  defaultSize: { width: 342, height: 140 },
  build(p, { width, height }) {
    const state = p.state as FieldState;
    const helper = state === 'error' ? p.error : p.helper;
    const top = labelBlock(p.label);
    const rows = Math.max(2, Math.round(p.rows));
    const lh = lineHeight('body');
    // Taller box: the field takes the extra height (the label and helper keep their places).
    const h = Math.max(Math.ceil(rows * lh + FIELD_PAD * 2), Math.ceil((height ?? 0) - top - helperBlock(helper)));
    const room = width - FIELD_PAD * 2 - (state === 'error' ? 26 : 0);
    const shown = p.value ? wrapLines(p.value, room, 'body', undefined, rows) : wrapLines(p.placeholder, room, 'body', undefined, rows);
    const body = shown.join('\n');
    const children = nodes(
      fieldLabel(p.label, width),
      fieldBox({ y: top, width, height: h, state }),
      body && text(body, { x: FIELD_PAD, y: top + FIELD_PAD, tone: p.value ? 'ink' : 'inkMuted', name: p.value ? 'Value' : 'Placeholder' }),
      // Resize grip in the corner.
      polyline([{ x: width - 14, y: top + h - 6 }, { x: width - 6, y: top + h - 14 }], { stroke: 'line', name: 'Grip' }),
      polyline([{ x: width - 10, y: top + h - 6 }, { x: width - 6, y: top + h - 10 }], { stroke: 'line', name: 'Grip' }),
      ...(state === 'error' ? errorBadge({ right: width - FIELD_PAD, y: top + FIELD_PAD - 6, height: 24 }) : []),
      fieldHelper(helper, top + h, width, state),
    );
    return { children, height: top + h + helperBlock(helper) };
  },
  describe(p) {
    const parts = [`Text area "${p.label}", ${Math.round(p.rows)} rows`];
    if (p.value) parts.push(`value "${p.value.replace(/\s*\n\s*/g, ' ')}"`);
    else if (p.placeholder) parts.push(`placeholder "${p.placeholder}"`);
    if (p.state === 'focused') parts.push('focused');
    if (p.state === 'error') parts.push(`error "${p.error}"`);
    else if (p.helper) parts.push(`helper "${p.helper}"`);
    return parts.join(', ');
  },
});
