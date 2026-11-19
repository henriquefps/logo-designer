import type { Vec } from '@/model';

/** Arrowhead triangle (screen space) with its tip at `tip`, pointing along the unit vector `dir`. */
export function arrowHead(tip: Vec, dir: Vec, size = 9): string {
  const bx = tip.x - dir.x * size;
  const by = tip.y - dir.y * size;
  const px = -dir.y * size * 0.55;
  const py = dir.x * size * 0.55;
  return `M${tip.x},${tip.y} L${bx + px},${by + py} L${bx - px},${by - py} Z`;
}

/** The canvas element's top-left in the viewport (fixed-position menus and editors sit outside it). */
export function canvasOrigin(): Vec {
  const r = document.querySelector('[data-slot="canvas"]')?.getBoundingClientRect();
  return r ? { x: r.left, y: r.top } : { x: 0, y: 0 };
}
