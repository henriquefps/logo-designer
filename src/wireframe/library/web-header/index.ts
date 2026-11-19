// Web header with navigation: logo placeholder, nav links (one selected), optional search, actions and avatar.
// Spans the screen edge to edge; items that do not fit the width are left out.
import { avatar, box, buttonBox, divider, nodes, part, searchBox, textInBand, textWidth } from '../../kit';
import { WF_SIZE, WF_SPACE } from '../../style';
import type { SceneNode } from '@/model';
import { defineComponent } from '../types';

const H = 64;
const PAD = WF_SPACE.xl;
const LINK_GAP = 28;

export default defineComponent({
  kind: 'web-header',
  label: 'Header with navigation',
  platforms: ['desktop', 'tablet'],
  category: 'Navigation',
  keywords: ['navbar', 'nav bar', 'top bar', 'menu', 'site header'],
  props: {
    links: { type: 'list', label: 'Links', item: 'Link', default: ['Home', 'Products', 'Pricing', 'About'], min: 0, max: 8 },
    selected: { type: 'number', label: 'Selected link', help: 'Position in the list, starting at 1.', default: 1, min: 1, max: 8 },
    search: { type: 'boolean', label: 'Search', default: false },
    actions: { type: 'list', label: 'Actions', item: 'Action', default: [], min: 0, max: 3, help: 'Buttons on the right; the last one is filled.' },
    avatar: { type: 'boolean', label: 'Avatar', default: false },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 1440, height: H },
  build(p, { width }) {
    const sel = Math.min(p.selected, p.links.length) - 1;
    const mid = H / 2;
    const logoW = 112;
    // Right side, from the edge inwards.
    let right = width - PAD;
    const rightKids: SceneNode[] = [];
    if (p.avatar) {
      rightKids.push(avatar({ x: right - WF_SIZE.controlSmall, y: mid - WF_SIZE.controlSmall / 2, size: WF_SIZE.controlSmall }));
      right -= WF_SIZE.controlSmall + WF_SPACE.lg;
    }
    p.actions.forEach((label, i, all) => {
      const b = buttonBox(label, { x: right, y: mid - WF_SIZE.controlSmall / 2, align: 'right', variant: i === all.length - 1 ? 'primary' : 'secondary' });
      rightKids.push(b.node);
      right -= b.width + WF_SPACE.sm;
    });
    if (p.search) {
      const w = Math.min(220, Math.max(0, right - PAD - logoW - 200));
      if (w >= 120) {
        rightKids.push(searchBox({ x: right - w, y: mid - WF_SIZE.controlSmall / 2, width: w }));
        right -= w + WF_SPACE.lg;
      }
    }
    // Links, after the logo, while they fit.
    const links: SceneNode[] = [];
    let x = PAD + logoW + 40;
    p.links.forEach((label, i) => {
      const w = textWidth(label, 'label', i === sel ? 600 : 500);
      if (x + w > right) return;
      links.push(
        textInBand(label, { x, y: 0, height: H, style: 'label', weight: i === sel ? 600 : 500, tone: i === sel ? 'ink' : 'inkMuted', name: i === sel ? 'Link (selected)' : 'Link' }),
        ...(i === sel ? [box({ x, y: H - 3, width: w, height: 2, fill: 'ink', stroke: 'none', name: 'Selected mark' })] : []),
      );
      x += w + LINK_GAP;
    });
    const children = nodes(
      box({ x: PAD, y: mid - 14, width: logoW, height: 28, radius: 4, fill: 'fill', stroke: 'line', name: 'Logo' }),
      links.length > 0 && part('Links', links),
      rightKids.length > 0 && part('Right', rightKids),
      divider({ x: 0, y: H - 0.5, width }),
    );
    return { children, height: H };
  },
  describe(p) {
    const parts = ['Header with navigation: logo'];
    if (p.links.length) parts.push(`links ${p.links.join(', ')} (${p.links[Math.min(p.selected, p.links.length) - 1]} selected)`);
    if (p.search) parts.push('search');
    if (p.actions.length) parts.push(`actions ${p.actions.join(', ')}`);
    if (p.avatar) parts.push('avatar');
    return parts.join('; ');
  },
});
