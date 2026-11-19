// Footer: a logo placeholder and columns of links (a heading and grey link bars), with an optional legal row.
// Edge to edge, on a light surface.
import { box, divider, imagePlaceholder, part, textBars, textInBand, truncate } from '../../kit';
import { WF_SPACE } from '../../style';
import { defineComponent } from '../types';

const PAD_X = 48;
const PAD_Y = 40;
const HEADING_H = 24;
const LINK_STEP = 28;
const LEGAL_H = 56;

export default defineComponent({
  kind: 'footer',
  label: 'Footer',
  platforms: ['desktop'],
  category: 'Layout',
  keywords: ['site footer', 'links', 'bottom', 'legal'],
  props: {
    columns: { type: 'list', label: 'Columns', item: 'Heading', default: ['Product', 'Company', 'Support'], min: 1, max: 6, help: 'Heading of each column of links.' },
    links: { type: 'number', label: 'Links per column', default: 4, min: 1, max: 8 },
    logo: { type: 'boolean', label: 'Logo', default: true },
    legal: { type: 'boolean', label: 'Legal row', default: true, help: 'Copyright line at the bottom.' },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 1440, height: 260 },
  build(p, { width }) {
    const links = Math.round(p.links);
    const inner = Math.max(0, width - PAD_X * 2);
    const logoW = p.logo ? Math.min(240, inner * 0.25) : 0;
    const gap = p.logo ? WF_SPACE.xl : 0;
    const colsW = Math.max(0, inner - logoW - gap);
    const cw = colsW / p.columns.length;
    const bodyH = HEADING_H + WF_SPACE.md + links * LINK_STEP;
    const h = Math.ceil(PAD_Y + bodyH + PAD_Y / 2 + (p.legal ? LEGAL_H : 0));
    const children = [box({ x: 0, y: 0, width, height: h, fill: 'surface', stroke: 'none', name: 'Background' }), divider({ x: 0, y: 0.5, width })];
    if (p.logo && logoW >= 16) {
      children.push(imagePlaceholder({ x: PAD_X, y: PAD_Y, width: Math.min(112, logoW), height: 28, radius: 4, name: 'Logo' }), textBars({ x: PAD_X, y: PAD_Y + 44, width: logoW * 0.8, lines: 2, style: 'label', name: 'Tagline' }));
    }
    p.columns.forEach((heading, i) => {
      const x = PAD_X + logoW + gap + i * cw;
      const bars = Array.from({ length: links }, (_, k) => textBars({ x, y: PAD_Y + HEADING_H + WF_SPACE.md + k * LINK_STEP + 4, width: Math.max(0, (cw - WF_SPACE.lg) * [0.7, 0.5, 0.6, 0.8][k % 4]), lines: 1, style: 'label', name: 'Link' }));
      children.push(part('Column', [textInBand(truncate(heading, Math.max(0, cw - WF_SPACE.lg), 'label', 600), { x, y: PAD_Y, height: HEADING_H, style: 'label', weight: 600, name: 'Heading' }), ...bars]));
    });
    if (p.legal) {
      const y = h - LEGAL_H;
      children.push(divider({ x: PAD_X, y, width: inner }), textBars({ x: PAD_X, y: y + (LEGAL_H - 20) / 2, width: Math.min(280, inner), lines: 1, style: 'label', name: 'Legal' }));
    }
    return { children, height: h };
  },
  describe(p) {
    const parts = [`Footer: columns ${p.columns.join(', ')}`, `${Math.round(p.links)} links each`];
    if (p.logo) parts.push('logo');
    if (p.legal) parts.push('legal row');
    return parts.join('; ');
  },
});
