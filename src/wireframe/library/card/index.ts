// Card: an outlined surface with an optional image on top, a title, body copy (grey bars) and actions.
import type { SceneNode } from "@/model";
import { box, imagePlaceholder, lineHeight, nodes, textBars, textBarsHeight, textInBand, text, textWidth, truncate } from '../../kit';
import { WF_RADIUS, WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD = WF_SPACE.lg;
const ACTION_H = 32;

export default defineComponent({
  kind: 'card',
  label: 'Card',
  platforms: 'all',
  category: 'Content',
  keywords: ['tile', 'panel', 'teaser', 'article', 'product'],
  props: {
    title: { type: 'text', label: 'Title', default: 'Card title', placeholder: 'None' },
    bodyLines: { type: 'number', label: 'Body lines', default: 2, min: 0, max: 8, step: 1, help: 'Grey bars for the description (0 = none).' },
    image: { type: 'boolean', label: 'Image on top', default: false },
    actions: { type: 'list', label: 'Actions', default: [], item: 'Action', min: 0, max: 3, help: 'Buttons along the bottom.' },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 342, height: 120 },
  build(p, { width }) {
    const inner = Math.max(0, width - PAD * 2);
    const lines = Math.round(p.bodyLines);
    const actions: string[] = p.actions.filter(Boolean);
    const body: SceneNode[] = [];
    let y = 0;
    if (p.image) {
      const imgH = Math.min(200, Math.round(((width - 2) * 9) / 16));
      body.push(imagePlaceholder({ x: 1, y: 1, width: width - 2, height: imgH, name: 'Image' }));
      y = imgH + 1;
    }
    y += PAD;
    if (p.title) {
      body.push(text(truncate(p.title, inner, 'subheading'), { x: PAD, y, style: 'subheading', name: 'Title' }));
      y += Math.ceil(lineHeight('subheading'));
    }
    if (lines > 0) {
      if (p.title) y += WF_SPACE.sm;
      body.push(textBars({ x: PAD, y, width: inner, lines, style: 'label', name: 'Body' }));
      y += Math.ceil(textBarsHeight(lines, 'label'));
    }
    if (actions.length) {
      y += WF_SPACE.md;
      let x = PAD;
      for (const a of actions) {
        const w = Math.ceil(textWidth(a, 'label', 600)) + WF_SPACE.lg * 2;
        if (x + w > width - PAD) break;
        body.push(box({ x, y, width: w, height: ACTION_H, radius: WF_RADIUS.md, fill: 'paper', stroke: 'ink', name: 'Action' }), textInBand(a, { x: x + w / 2, y, height: ACTION_H, style: 'label', weight: 600, align: 'center', name: 'Action label' }));
        x += w + WF_SPACE.sm;
      }
      y += ACTION_H;
    }
    const hasContent = p.image || p.title || lines > 0 || actions.length;
    const height = Math.ceil(hasContent ? y + PAD : PAD * 3);
    const children = nodes(
      box({ x: 0, y: 0, width, height, radius: WF_RADIUS.md, fill: 'paper', stroke: 'none', name: 'Surface' }),
      ...body,
      box({ x: 0, y: 0, width, height, radius: WF_RADIUS.md, fill: 'none', stroke: 'line', name: 'Outline' }),
    );
    return { children, height };
  },
  describe(p) {
    const parts = ['Card'];
    if (p.image) parts.push('image on top');
    if (p.title) parts.push(`title "${p.title}"`);
    if (p.bodyLines > 0) parts.push(`${Math.round(p.bodyLines)} lines of body text (placeholder)`);
    if (p.actions.length) parts.push(`actions: ${p.actions.filter(Boolean).map((a: string) => `"${a}"`).join(', ')}`);
    return parts.join(', ');
  },
});
