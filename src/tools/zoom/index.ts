import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { rectFromCorners, type Vec } from '@/model';
import type { Tool } from '../types';

let start: { point: Vec; screen: Vec } | null = null;

const zoom: Tool = {
  id: 'zoom',
  label: 'Zoom',
  shortcut: 'z',
  icon: MagnifyingGlassIcon,
  cursor: 'zoom-in',
  group: 'view',
  order: 10,
  hint: 'Click to zoom in, Alt-click to zoom out, drag to zoom to an area.',
  onPointerDown(e) {
    start = { point: e.point, screen: e.screen };
  },
  onPointerMove(e, ctx) {
    const ed = ctx.editor();
    if (!e.pressed) {
      ed.setCursor(e.alt ? 'zoom-out' : 'zoom-in');
      return;
    }
    if (!start) return;
    if (Math.hypot(e.screen.x - start.screen.x, e.screen.y - start.screen.y) > 4) ed.setMarquee(rectFromCorners(start.point, e.point));
  },
  onPointerUp(e, ctx) {
    const ed = ctx.editor();
    const marquee = ed.marquee;
    ed.setMarquee(null);
    if (marquee && marquee.width > 0 && marquee.height > 0) ed.fitRect(marquee, 0);
    else ed.setZoom(ed.zoom * (e.alt ? 0.5 : 2), e.screen);
    start = null;
  },
  onCancel(ctx) {
    start = null;
    ctx.editor().setMarquee(null);
  },
};

export default zoom;
