import type { BezierPoint, SubPath, Vec } from '@/model/types';

/** Normalized path segments (all absolute; quadratics elevated, arcs split into cubics). */
export type Seg =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'C'; c1: Vec; c2: Vec; x: number; y: number }
  | { t: 'Z' };

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([a-zA-Z])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ?? parseFloat(m[2]));
  return out;
}

/** Arc (endpoint parameterization) → cubic Béziers (SVG spec F.6). */
export function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, fa: boolean, fs: boolean, x2: number, y2: number): Seg[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [{ t: 'L', x: x2, y: y2 }];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI;
  else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const step = dth / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const segs: Seg[] = [];
  const pt = (a: number): Vec => ({ x: cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, y: cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos });
  const dv = (a: number): Vec => ({ x: -rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, y: -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos });
  for (let i = 0; i < n; i++) {
    const a1 = th1 + i * step;
    const a2 = a1 + step;
    const p1 = pt(a1);
    const p2 = i === n - 1 ? { x: x2, y: y2 } : pt(a2);
    const d1 = dv(a1);
    const d2 = dv(a2);
    segs.push({ t: 'C', c1: { x: p1.x + k * d1.x, y: p1.y + k * d1.y }, c2: { x: p2.x - k * d2.x, y: p2.y - k * d2.y }, x: p2.x, y: p2.y });
  }
  return segs;
}

/** Parses SVG path data into absolute normalized segments. Tolerant: stops at the first malformed command. */
export function parsePathData(d: string): Seg[] {
  const tok = tokenize(d);
  const segs: Seg[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: Vec | null = null; // last cubic control point 2 (for S)
  let lastQ: Vec | null = null; // last quad control point (for T)
  const num = () => tok[i++] as number;
  while (i < tok.length) {
    if (typeof tok[i] === 'string') cmd = tok[i++] as string;
    else if (!cmd || cmd === 'z' || cmd === 'Z') break;
    const lower = cmd.toLowerCase();
    const n = ARGS[lower];
    if (n === undefined) break;
    const rel = cmd === lower;
    if (lower === 'z') {
      segs.push({ t: 'Z' });
      x = sx;
      y = sy;
      lastC = lastQ = null;
      continue;
    }
    if (i + n > tok.length || tok.slice(i, i + n).some((v) => typeof v !== 'number')) break;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    let nc: Vec | null = null;
    let nq: Vec | null = null;
    switch (lower) {
      case 'm': {
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        segs.push({ t: 'M', x, y });
        cmd = rel ? 'l' : 'L'; // subsequent pairs are implicit lineto
        break;
      }
      case 'l':
        x = ox + num();
        y = oy + num();
        segs.push({ t: 'L', x, y });
        break;
      case 'h':
        x = (rel ? x : 0) + num();
        segs.push({ t: 'L', x, y });
        break;
      case 'v':
        y = (rel ? y : 0) + num();
        segs.push({ t: 'L', x, y });
        break;
      case 'c': {
        const c1 = { x: ox + num(), y: oy + num() };
        const c2 = { x: ox + num(), y: oy + num() };
        x = ox + num();
        y = oy + num();
        segs.push({ t: 'C', c1, c2, x, y });
        nc = c2;
        break;
      }
      case 's': {
        const c1 = lastC ? { x: 2 * x - lastC.x, y: 2 * y - lastC.y } : { x, y };
        const c2 = { x: ox + num(), y: oy + num() };
        x = ox + num();
        y = oy + num();
        segs.push({ t: 'C', c1, c2, x, y });
        nc = c2;
        break;
      }
      case 'q':
      case 't': {
        const q: Vec = lower === 'q' ? { x: ox + num(), y: oy + num() } : lastQ ? { x: 2 * x - lastQ.x, y: 2 * y - lastQ.y } : { x, y };
        const nx = ox + num();
        const ny = oy + num();
        segs.push({
          t: 'C',
          c1: { x: x + (2 / 3) * (q.x - x), y: y + (2 / 3) * (q.y - y) },
          c2: { x: nx + (2 / 3) * (q.x - nx), y: ny + (2 / 3) * (q.y - ny) },
          x: nx,
          y: ny,
        });
        x = nx;
        y = ny;
        nq = q;
        break;
      }
      case 'a': {
        const rx = num();
        const ry = num();
        const rot = num();
        const fa = num() !== 0;
        const fs = num() !== 0;
        const nx = ox + num();
        const ny = oy + num();
        segs.push(...arcToCubics(x, y, rx, ry, rot, fa, fs, nx, ny));
        x = nx;
        y = ny;
        break;
      }
    }
    lastC = nc;
    lastQ = nq;
  }
  return segs;
}

const EPS = 1e-6;
const same = (a: Vec, b: Vec) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Segments → model subpaths (handles are absolute). */
export function segsToSubpaths(segs: Seg[]): SubPath[] {
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let pendingStart: Vec | null = null;
  const start = (x: number, y: number) => {
    cur = { points: [{ x, y, type: 'corner' }], closed: false };
    out.push(cur);
  };
  const close = () => {
    const sp = cur;
    if (!sp) return;
    sp.closed = true;
    const pts = sp.points;
    if (pts.length > 1 && same(pts[0], pts[pts.length - 1])) {
      const last = pts.pop() as BezierPoint;
      if (last.in) pts[0].in = last.in;
    }
  };
  for (const s of segs) {
    if (s.t === 'M') start(s.x, s.y);
    else if (s.t === 'Z') {
      close();
      const first: BezierPoint | undefined = (cur as SubPath | null)?.points[0];
      cur = null;
      // A drawing command after Z starts a new subpath at the previous start point.
      if (first) pendingStart = { x: first.x, y: first.y };
    } else {
      if (!cur) {
        const p: Vec = pendingStart ?? { x: s.x, y: s.y };
        start(p.x, p.y);
      }
      pendingStart = null;
      const sp = cur as unknown as SubPath;
      const prev = sp.points[sp.points.length - 1];
      if (s.t === 'C') {
        prev.out = s.c1;
        sp.points.push({ x: s.x, y: s.y, in: s.c2, type: 'corner' });
      } else sp.points.push({ x: s.x, y: s.y, type: 'corner' });
    }
  }
  return out.filter((sp) => sp.points.length > 1 || sp.closed);
}
export const pathDataToSubpaths = (d: string): SubPath[] => segsToSubpaths(parsePathData(d));
