// Bounding box of an SVG path `d` (curves and arcs sampled), for placing Android gradients on a
// VectorDrawable path. MIRRORS pathBox() in ~/.agents/skills/hfps-repo-assets/assets/build-icons.mjs.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const STEPS = 24;

/** Box of the path, or null when `d` has no points / cannot be parsed. */
export function pathBox(d: string): Box | null {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!toks) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const add = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0,
    pcx = 0,
    pcy = 0,
    prev = '';
  let i = 0;
  let cmd = '';
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) return null;
    const up = cmd.toUpperCase();
    const n = ARGS[up];
    if (n === undefined) return null;
    const rel = cmd !== up;
    const a: number[] = [];
    for (let k = 0; k < n; k++) a.push(Number(toks[i++]));
    if (a.some((v) => !Number.isFinite(v))) return null;
    const ox = rel ? cx : 0,
      oy = rel ? cy : 0;
    const bez = (pts: number[][]) => {
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        let q = pts;
        while (q.length > 1) q = q.slice(1).map((p, j) => [q[j][0] + (p[0] - q[j][0]) * t, q[j][1] + (p[1] - q[j][1]) * t]);
        add(q[0][0], q[0][1]);
      }
    };
    if (up === 'M') {
      cx = a[0] + ox;
      cy = a[1] + oy;
      sx = cx;
      sy = cy;
      add(cx, cy);
      cmd = rel ? 'l' : 'L'; // further pairs are implicit lineto
    } else if (up === 'L') {
      cx = a[0] + ox;
      cy = a[1] + oy;
      add(cx, cy);
    } else if (up === 'H') {
      cx = a[0] + ox;
      add(cx, cy);
    } else if (up === 'V') {
      cy = a[0] + oy;
      add(cx, cy);
    } else if (up === 'C' || up === 'S') {
      const p1 = up === 'C' ? [a[0] + ox, a[1] + oy] : 'CS'.includes(prev) ? [2 * cx - pcx, 2 * cy - pcy] : [cx, cy];
      const k = up === 'C' ? 2 : 0;
      const p2 = [a[k] + ox, a[k + 1] + oy],
        p = [a[k + 2] + ox, a[k + 3] + oy];
      bez([[cx, cy], p1, p2, p]);
      pcx = p2[0];
      pcy = p2[1];
      cx = p[0];
      cy = p[1];
    } else if (up === 'Q' || up === 'T') {
      const c1 = up === 'Q' ? [a[0] + ox, a[1] + oy] : 'QT'.includes(prev) ? [2 * cx - pcx, 2 * cy - pcy] : [cx, cy];
      const p = up === 'Q' ? [a[2] + ox, a[3] + oy] : [a[0] + ox, a[1] + oy];
      bez([[cx, cy], c1, p]);
      pcx = c1[0];
      pcy = c1[1];
      cx = p[0];
      cy = p[1];
    } else if (up === 'A') {
      const ex = a[5] + ox,
        ey = a[6] + oy;
      arc(cx, cy, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, ex, ey, add);
      cx = ex;
      cy = ey;
    } else if (up === 'Z') {
      cx = sx;
      cy = sy;
    }
    prev = up;
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** SVG endpoint arc → centre form (SVG 1.1 F.6.5), sampled. */
function arc(x1: number, y1: number, rx: number, ry: number, rot: number, large: boolean, sweep: boolean, x2: number, y2: number, add: (x: number, y: number) => void) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return add(x2, y2);
  const phi = (rot * Math.PI) / 180,
    c = Math.cos(phi),
    s = Math.sin(phi);
  const dx = (x1 - x2) / 2,
    dy = (y1 - y2) / 2;
  const px = c * dx + s * dy,
    py = -s * dx + c * dy;
  const lam = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px;
  const den = rx * rx * py * py + ry * ry * px * px;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * py) / ry,
    cyp = (-k * ry * px) / rx;
  const ccx = c * cxp - s * cyp + (x1 + x2) / 2,
    ccy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (px - cxp) / rx, (py - cyp) / ry);
  let dt = ang((px - cxp) / rx, (py - cyp) / ry, (-px - cxp) / rx, (-py - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  for (let i = 1; i <= STEPS * 2; i++) {
    const t = t1 + (dt * i) / (STEPS * 2);
    add(ccx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, ccy + rx * Math.cos(t) * s + ry * Math.sin(t) * c);
  }
}
