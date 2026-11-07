// SVG path data parser: every command (M L H V C S Q T A Z, absolute and relative) becomes
// cubic Bézier subpaths in the document model's BezierPoint form.
import type { BezierPoint, SubPath, Vec } from '@/model';
import { apply, type Matrix } from '@/model';

const CMD = /[MmLlHhVvCcSsQqTtAaZz]/;
const ARG_COUNT: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const EPS = 1e-6;

/** Tokenizes path data into commands and numbers (handles "1.5.5", "1e-3", "-1-2" and compact arc flags). */
function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  let i = 0;
  let cmd = '';
  let argIndex = 0;
  const n = d.length;
  const num = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
  while (i < n) {
    const ch = d[i];
    if (CMD.test(ch)) {
      out.push(ch);
      cmd = ch.toLowerCase();
      argIndex = 0;
      i++;
      continue;
    }
    if (ch === ' ' || ch === ',' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\f') {
      i++;
      continue;
    }
    // Arc flags (4th and 5th arg) are a single 0/1 char and may be written without separators.
    if (cmd === 'a' && (argIndex % 7 === 3 || argIndex % 7 === 4) && (ch === '0' || ch === '1')) {
      out.push(ch === '1' ? 1 : 0);
      argIndex++;
      i++;
      continue;
    }
    const m = num.exec(d.slice(i, i + 64));
    if (!m) break; // Invalid data: keep what parsed so far, like browsers do.
    out.push(parseFloat(m[0]));
    argIndex++;
    i += m[0].length;
  }
  return out;
}

const pt = (x: number, y: number): BezierPoint => ({ x, y, type: 'corner' });

/**
 * Converts an SVG arc into cubic segments (each ≤ 90°). Returns [c1, c2, end] triples.
 * Implements the endpoint → center parameterization from the SVG spec (F.6.5).
 */
export function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): [Vec, Vec, Vec][] {
  if (Math.abs(x1 - x2) < EPS && Math.abs(y1 - y2) < EPS) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < EPS || ry < EPS) return [[{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x2, y: y2 }]];
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  else if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  const segs = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2) - 1e-9));
  const delta = dtheta / segs;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: [Vec, Vec, Vec][] = [];
  const map = (ex: number, ey: number): Vec => ({ x: cx + rx * ex * cos - ry * ey * sin, y: cy + rx * ex * sin + ry * ey * cos });
  let a = theta1;
  for (let i = 0; i < segs; i++) {
    const b = a + delta;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const c1 = map(ca - t * sa, sa + t * ca);
    const c2 = map(cb + t * sb, sb - t * cb);
    const end = i === segs - 1 ? { x: x2, y: y2 } : map(cb, sb);
    out.push([c1, c2, end]);
    a = b;
  }
  return out;
}

/** Marks points whose two handles are collinear and opposite as smooth (or symmetric). */
function classify(p: BezierPoint) {
  if (!p.in || !p.out) return;
  const ax = p.in.x - p.x;
  const ay = p.in.y - p.y;
  const bx = p.out.x - p.x;
  const by = p.out.y - p.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < EPS || lb < EPS) return;
  const cross = (ax * by - ay * bx) / (la * lb);
  const dot = (ax * bx + ay * by) / (la * lb);
  if (Math.abs(cross) < 1e-3 && dot < 0) p.type = Math.abs(la - lb) < 1e-3 * Math.max(la, lb) ? 'symmetric' : 'smooth';
}

/** Parses SVG path data into subpaths (absolute coordinates, all curves as cubics). Never throws: stops at the first error. */
export function parsePathData(d: string): SubPath[] {
  const tokens = tokenize(d);
  const subpaths: SubPath[] = [];
  let cur: SubPath | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrl: Vec | null = null; // reflected control for S/T
  let lastCmd = '';
  let i = 0;

  const last = () => cur!.points[cur!.points.length - 1];
  const ensure = () => {
    if (!cur) {
      cur = { points: [pt(x, y)], closed: false };
      subpaths.push(cur);
    }
  };
  const lineTo = (nx: number, ny: number) => {
    ensure();
    cur!.points.push(pt(nx, ny));
    x = nx;
    y = ny;
  };
  const cubicTo = (c1: Vec, c2: Vec, nx: number, ny: number) => {
    ensure();
    last().out = { x: c1.x, y: c1.y };
    cur!.points.push({ x: nx, y: ny, in: { x: c2.x, y: c2.y }, type: 'corner' });
    x = nx;
    y = ny;
  };

  while (i < tokens.length) {
    let cmd = tokens[i];
    if (typeof cmd === 'number') {
      // Implicit repetition of the previous command (M repeats as L).
      if (!lastCmd) break;
      cmd = lastCmd === 'M' ? 'L' : lastCmd === 'm' ? 'l' : lastCmd;
    } else i++;
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const count = ARG_COUNT[lower];
    const args: number[] = [];
    for (let k = 0; k < count; k++) {
      const v = tokens[i];
      if (typeof v !== 'number') break;
      args.push(v);
      i++;
    }
    if (args.length < count) break;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    let ctrl: Vec | null = null;
    switch (lower) {
      case 'm':
        x = args[0] + ox;
        y = args[1] + oy;
        startX = x;
        startY = y;
        cur = { points: [pt(x, y)], closed: false };
        subpaths.push(cur);
        break;
      case 'l':
        lineTo(args[0] + ox, args[1] + oy);
        break;
      case 'h':
        lineTo(args[0] + ox, y);
        break;
      case 'v':
        lineTo(x, args[0] + (rel ? y : 0));
        break;
      case 'c': {
        const c2 = { x: args[2] + ox, y: args[3] + oy };
        cubicTo({ x: args[0] + ox, y: args[1] + oy }, c2, args[4] + ox, args[5] + oy);
        ctrl = c2;
        break;
      }
      case 's': {
        const prev = lastCmd.toLowerCase();
        const c1 = (prev === 'c' || prev === 's') && lastCtrl ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y };
        const c2 = { x: args[0] + ox, y: args[1] + oy };
        cubicTo(c1, c2, args[2] + ox, args[3] + oy);
        ctrl = c2;
        break;
      }
      case 'q':
      case 't': {
        let q: Vec;
        let end: Vec;
        if (lower === 'q') {
          q = { x: args[0] + ox, y: args[1] + oy };
          end = { x: args[2] + ox, y: args[3] + oy };
        } else {
          const prev = lastCmd.toLowerCase();
          q = (prev === 'q' || prev === 't') && lastCtrl ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y };
          end = { x: args[0] + ox, y: args[1] + oy };
        }
        const c1 = { x: x + (2 / 3) * (q.x - x), y: y + (2 / 3) * (q.y - y) };
        const c2 = { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) };
        cubicTo(c1, c2, end.x, end.y);
        ctrl = q;
        break;
      }
      case 'a': {
        const ex = args[5] + ox;
        const ey = args[6] + oy;
        const cubics = arcToCubics(x, y, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, ex, ey);
        for (const [c1, c2, end] of cubics) cubicTo(c1, c2, end.x, end.y);
        x = ex;
        y = ey;
        break;
      }
      case 'z':
        if (cur) {
          const sp: SubPath = cur;
          sp.closed = true;
          const pts = sp.points;
          const end = pts[pts.length - 1];
          if (pts.length > 1 && Math.abs(end.x - pts[0].x) < EPS && Math.abs(end.y - pts[0].y) < EPS) {
            // Drop the duplicated closing point, keeping its incoming handle on the first point.
            if (end.in) pts[0].in = end.in;
            pts.pop();
          }
        }
        x = startX;
        y = startY;
        cur = null;
        break;
    }
    lastCtrl = ctrl;
    lastCmd = cmd;
  }
  const result = subpaths.filter((sp) => sp.points.length > 1 || sp.closed);
  for (const sp of result) sp.points.forEach(classify);
  return result;
}

/** Applies a matrix to every anchor and handle (Béziers are affine invariant). */
export function transformSubpaths(subpaths: SubPath[], m: Matrix): SubPath[] {
  return subpaths.map((sp) => ({
    closed: sp.closed,
    points: sp.points.map((p) => {
      const q: BezierPoint = { ...apply(m, p), type: p.type };
      if (p.in) q.in = apply(m, p.in);
      if (p.out) q.out = apply(m, p.out);
      return q;
    }),
  }));
}
