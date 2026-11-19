// Helpers shared by the common components (fields, labels, wrapped text). Not a component folder, so the
// registry's glob ignores it. Everything here draws with the kit and the style tokens only.
import { box, circle, lineHeight, nodes, polyline, text, textInBand, textWidth, truncate } from '../kit';
import { WF_RADIUS, WF_SPACE, type WfTextStyle } from '../style';
import type { SceneNode } from '@/model';

/** Space between a field's label and its box, and between the box and its helper text. */
export const LABEL_GAP = 6;
export const HELPER_GAP = WF_SPACE.xs;
export const FIELD_PAD = WF_SPACE.md;

export type FieldState = 'normal' | 'focused' | 'error';
export const FIELD_STATES = ['normal', 'focused', 'error'] as const;

/** Greedy word wrap with the kit's text metrics: lines that fit `maxWidth` (a word wider than that is cut with an ellipsis). */
export function wrapLines(value: string, maxWidth: number, style: WfTextStyle = 'body', weight?: number, maxLines = 100): string[] {
  const out: string[] = [];
  for (const para of value.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (textWidth(next, style, weight) <= maxWidth) cur = next;
      else {
        if (cur) out.push(cur);
        cur = textWidth(word, style, weight) <= maxWidth ? word : truncate(word, maxWidth, style, weight);
      }
    }
    out.push(cur);
  }
  return out.slice(0, maxLines);
}

/** Height of a field's label row (0 when there is no label). */
export const labelBlock = (label: string) => (label ? Math.ceil(lineHeight('label')) + LABEL_GAP : 0);
/** Height of the helper line under a field (0 when there is none). */
export const helperBlock = (helper: string) => (helper ? HELPER_GAP + Math.ceil(lineHeight('caption')) : 0);

/** The label above a field. */
export const fieldLabel = (label: string, width: number): SceneNode | null =>
  label ? text(truncate(label, width, 'label'), { x: 0, y: 0, style: 'label', name: 'Label' }) : null;

/** The helper (or error) line under a field at `y`. */
export const fieldHelper = (helper: string, y: number, width: number, state: FieldState): SceneNode | null =>
  helper ? text(truncate(helper, width, 'caption'), { x: 0, y: y + HELPER_GAP, style: 'caption', tone: state === 'error' ? 'ink' : 'inkMuted', name: state === 'error' ? 'Error' : 'Helper' }) : null;

/** A field's box: light outline, dark when focused or in error. */
export function fieldBox(o: { x?: number; y: number; width: number; height: number; state: FieldState; radius?: number; fill?: 'paper' | 'surface' }): SceneNode {
  const box_ = box({ x: o.x ?? 0, y: o.y, width: o.width, height: o.height, radius: o.radius ?? WF_RADIUS.md, fill: o.fill ?? 'paper', stroke: o.state === 'normal' ? 'inkMuted' : 'ink', name: 'Field' });
  if (o.state === 'error' && box_.type === 'rect') box_.stroke = { ...box_.stroke, dash: [4, 3] };
  return box_;
}

/** A small "!" badge at the right of a field in error. */
export function errorBadge(o: { right: number; y: number; height: number }): SceneNode[] {
  const s = 18;
  const x = o.right - s;
  const y = o.y + (o.height - s) / 2;
  return [circle({ x, y, size: s, fill: 'paper', stroke: 'ink', name: 'Error mark' }), textInBand('!', { x: x + s / 2, y, height: s, style: 'caption', weight: 700, align: 'center', name: 'Error mark text' })];
}

/** A text caret (a focused field with text). */
export const caret = (x: number, y: number, height: number): SceneNode => polyline([{ x, y: y + (height - 20) / 2 }, { x, y: y + (height + 20) / 2 }], { stroke: 'ink', width: 1.5, name: 'Caret' });

/** The text inside a one-line field: the value, else the placeholder in grey. Returns the nodes and the x where the text ends. */
export function fieldText(o: { value: string; placeholder: string; x: number; y: number; height: number; room: number; focused: boolean; mask?: boolean }): { nodes: SceneNode[]; end: number } {
  const shown = o.mask && o.value ? '•'.repeat(Math.min(o.value.length, 12)) : o.value;
  const content = truncate(shown || o.placeholder, Math.max(0, o.room), 'body');
  const hasValue = !!shown;
  const out = nodes(content && textInBand(content, { x: o.x, y: o.y, height: o.height, tone: hasValue ? 'ink' : 'inkMuted', name: hasValue ? 'Value' : 'Placeholder' }));
  const end = o.x + (hasValue ? textWidth(content, 'body') : 0);
  if (o.focused) out.push(caret(end + 1, o.y, o.height));
  return { nodes: out, end };
}

