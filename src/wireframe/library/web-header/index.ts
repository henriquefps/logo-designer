// Web header with navigation: logo placeholder, nav links (one selected), optional search, actions and avatar.
// Spans the screen edge to edge; items that do not fit the width are left out.
import { avatar, box, buttonBox, describeItems, divider, itemKey, nodes, part, rect, searchBox, selectedFromItem, textInBand, textWidth } from '../../kit';
import { WF_SIZE, WF_SPACE } from '../../style';
import type { SceneNode } from '@/model';
import { defineComponent } from '../types';

const H = 64;
const PAD = WF_SPACE.xl;
const LINK_GAP = 28;
const LOGO_W = 112;

interface HeaderLayout {
  links: { i: number; x: number; w: number }[];
  actions: { i: number; x: number; w: number; primary: boolean }[];
  avatar: { x: number } | null;
  search: { x: number; w: number } | null;
}

/** Where everything goes (shared by `build` and `parts`): right side from the edge inwards, then the links while they fit. */
function headerLayout(p: { links: string[]; selected: number; search: boolean; actions: string[]; avatar: boolean }, width: number): HeaderLayout {
  const sel = Math.min(p.selected, p.links.length) - 1;
  const out: HeaderLayout = { links: [], actions: [], avatar: null, search: null };
  let right = width - PAD;
  if (p.avatar) {
    out.avatar = { x: right - WF_SIZE.controlSmall };
    right -= WF_SIZE.controlSmall + WF_SPACE.lg;
  }
  p.actions.forEach((label, i, all) => {
    const w = buttonBox(label, { x: right, y: 0, align: 'right' }).width;
    out.actions.push({ i, x: right - w, w, primary: i === all.length - 1 });
    right -= w + WF_SPACE.sm;
  });
  if (p.search) {
    const w = Math.min(220, Math.max(0, right - PAD - LOGO_W - 200));
    if (w >= 120) {
      out.search = { x: right - w, w };
      right -= w + WF_SPACE.lg;
    }
  }
  let x = PAD + LOGO_W + 40;
  p.links.forEach((label, i) => {
    const w = textWidth(label, 'label', i === sel ? 600 : 500);
    if (x + w > right) return;
    out.links.push({ i, x, w });
    x += w + LINK_GAP;
  });
  return out;
}

export default defineComponent({
  kind: 'web-header',
  label: 'Header with navigation',
  platforms: ['desktop', 'tablet'],
  category: 'Navigation',
  keywords: ['navbar', 'nav bar', 'top bar', 'menu', 'site header'],
  props: {
    links: { type: 'list', label: 'Links', item: 'Link', default: ['Home', 'Products', 'Pricing', 'About'], min: 0, max: 8 },
    selected: { type: 'number', label: 'Selected link', help: 'Position in the list, starting at 1. Follows the screen: the link that opens the screen on show.', default: 1, min: 1, max: 8, auto: { label: 'Follows the screen', default: true } },
    search: { type: 'boolean', label: 'Search', default: false },
    actions: { type: 'list', label: 'Actions', item: 'Action', default: [], min: 0, max: 3, help: 'Buttons on the right; the last one is filled.' },
    avatar: { type: 'boolean', label: 'Avatar', default: false },
  },
  sizing: { width: 'fill', height: 'hug', bleed: true },
  defaultSize: { width: 1440, height: H },
  build(p, { width }) {
    const sel = Math.min(p.selected, p.links.length) - 1;
    const mid = H / 2;
    const l = headerLayout(p, width);
    const rightKids: SceneNode[] = [];
    if (l.avatar) rightKids.push(avatar({ x: l.avatar.x, y: mid - WF_SIZE.controlSmall / 2, size: WF_SIZE.controlSmall }));
    for (const a of l.actions) rightKids.push(buttonBox(p.actions[a.i], { x: a.x + a.w, y: mid - WF_SIZE.controlSmall / 2, align: 'right', variant: a.primary ? 'primary' : 'secondary' }).node);
    if (l.search) rightKids.push(searchBox({ x: l.search.x, y: mid - WF_SIZE.controlSmall / 2, width: l.search.w }));
    const links: SceneNode[] = [];
    for (const { i, x, w } of l.links) {
      const label = p.links[i];
      links.push(
        textInBand(label, { x, y: 0, height: H, style: 'label', weight: i === sel ? 600 : 500, tone: i === sel ? 'ink' : 'inkMuted', name: i === sel ? 'Link (selected)' : 'Link' }),
        ...(i === sel ? [box({ x, y: H - 3, width: w, height: 2, fill: 'ink', stroke: 'none', name: 'Selected mark' })] : []),
      );
    }
    const children = nodes(
      box({ x: PAD, y: mid - 14, width: LOGO_W, height: 28, radius: 4, fill: 'fill', stroke: 'line', name: 'Logo' }),
      links.length > 0 && part('Links', links),
      rightKids.length > 0 && part('Right', rightKids),
      divider({ x: 0, y: H - 0.5, width }),
    );
    return { children, height: H };
  },
  parts(p, { width }) {
    const l = headerLayout(p, width);
    const mid = H / 2;
    const half = LINK_GAP / 2;
    return [
      { key: 'logo', label: 'Logo', rect: rect(PAD, mid - 14, LOGO_W, 28) },
      ...l.links.map(({ i, x, w }) => ({ key: itemKey(i), label: p.links[i], rect: rect(x - half, 0, w + LINK_GAP, H) })),
      ...l.actions.map(({ i, x, w }) => ({ key: itemKey(i, 'action'), label: p.actions[i], rect: rect(x, mid - WF_SIZE.controlSmall / 2, w, WF_SIZE.controlSmall) })),
      ...(l.avatar ? [{ key: 'avatar', label: 'Avatar', rect: rect(l.avatar.x, mid - WF_SIZE.controlSmall / 2, WF_SIZE.controlSmall, WF_SIZE.controlSmall) }] : []),
    ];
  },
  partLists: { item: 'links', action: 'actions' },
  selectFromPart: (_p, key) => selectedFromItem(key),
  describe(p, opens) {
    const parts = ['Header with navigation: logo'];
    const sel = Math.min(p.selected, p.links.length) - 1;
    const links = p.links.map((label, i) => ({ key: itemKey(i), label, selected: i === sel }));
    if (links.some((it) => opens?.has(it.key))) parts.push(`links ${describeItems(links, opens)}`);
    else if (p.links.length) parts.push(`links ${p.links.join(', ')} (${p.links[sel]} selected)`);
    if (p.search) parts.push('search');
    const actions = p.actions.map((label, i) => ({ key: itemKey(i, 'action'), label }));
    if (actions.some((it) => opens?.has(it.key))) parts.push(`actions ${describeItems(actions, opens)}`);
    else if (p.actions.length) parts.push(`actions ${p.actions.join(', ')}`);
    if (p.avatar) parts.push('avatar');
    return parts.join('; ');
  },
});
