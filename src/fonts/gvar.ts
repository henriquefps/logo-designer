import { findTable } from './kerning';

/**
 * Variable TrueType outlines (glyf + gvar), read straight from the sfnt bytes.
 *
 * opentype.js 2.0 applies gvar deltas wrongly for a lot of glyphs (a tuple that lists "all points"
 * is mistaken for "the shared points", points are rounded after every tuple, …): at weight 600 an
 * Inter "D" came out as a thin hook, and many accented letters and punctuation marks were off, which
 * made `designer to-png` / SVG exports differ from what the canvas draws. This follows the OpenType
 * spec (tuple scalars with intermediate regions, avar, packed points and deltas, IUP for
 * unreferenced points, composite offsets) and keeps full precision until the path is built.
 * Anything it does not support (point-matched components, CFF2, malformed data) returns null and
 * the caller falls back to opentype.js.
 */

/** Path command in SVG space (y down), the shape opentype.js' `Path.commands` use. */
export type OutlineCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'Z' };

export interface VarAxis {
  tag: string;
  minValue: number;
  defaultValue: number;
  maxValue: number;
}

interface Pt {
  x: number;
  y: number;
  on: boolean;
}
interface Contoured {
  pts: Pt[];
  ends: number[];
}
interface Component {
  gid: number;
  dx: number;
  dy: number;
  m: [number, number, number, number]; // xx, yx, xy, yy
}
interface RawGlyph {
  simple?: Contoured;
  components?: Component[];
}

const f2dot14 = (v: DataView, o: number) => v.getInt16(o) / 16384;

/** Normalizes user-space axis values to -1..1 and applies the avar segment maps. */
export function normalizeCoords(axes: VarAxis[], avar: [number, number][][] | null, coords: Record<string, number>): number[] {
  return axes.map((a, i) => {
    const raw = coords[a.tag] ?? a.defaultValue;
    const v = Math.min(a.maxValue, Math.max(a.minValue, raw));
    let n = 0;
    if (v < a.defaultValue) n = (v - a.defaultValue) / (a.defaultValue - a.minValue);
    else if (v > a.defaultValue) n = (v - a.defaultValue) / (a.maxValue - a.defaultValue);
    const map = avar?.[i];
    if (!map?.length) return n;
    for (let j = 0; j < map.length; j++) {
      const [from, to] = map[j];
      if (n === from) return to;
      if (n < from) {
        if (j === 0) return to;
        const [pf, pt] = map[j - 1];
        return pt + ((n - pf) * (to - pt)) / (from - pf);
      }
    }
    return map[map.length - 1][1];
  });
}

export function readAvar(v: DataView): [number, number][][] | null {
  const t = findTable(v, 'avar');
  if (!t) return null;
  let o = t[0] + 8;
  const axisCount = v.getUint16(t[0] + 6);
  const maps: [number, number][][] = [];
  for (let a = 0; a < axisCount; a++) {
    const n = v.getUint16(o);
    o += 2;
    const m: [number, number][] = [];
    for (let i = 0; i < n; i++, o += 4) m.push([f2dot14(v, o), f2dot14(v, o + 2)]);
    maps.push(m);
  }
  return maps;
}

function readPackedPoints(v: DataView, o: number): { points: number[] | null; next: number } {
  let count = v.getUint8(o++);
  if (count & 0x80) count = ((count & 0x7f) << 8) | v.getUint8(o++);
  if (count === 0) return { points: null, next: o }; // all points
  const points: number[] = [];
  let last = 0;
  while (points.length < count) {
    const ctl = v.getUint8(o++);
    const words = ctl & 0x80;
    const run = (ctl & 0x7f) + 1;
    for (let i = 0; i < run && points.length < count; i++) {
      last += words ? v.getUint16(o) : v.getUint8(o);
      o += words ? 2 : 1;
      points.push(last);
    }
  }
  return { points, next: o };
}

function readPackedDeltas(v: DataView, o: number, count: number): { deltas: number[]; next: number } {
  const out: number[] = [];
  while (out.length < count) {
    const ctl = v.getUint8(o++);
    const run = (ctl & 0x3f) + 1;
    for (let i = 0; i < run && out.length < count; i++) {
      if (ctl & 0x80) out.push(0);
      else if (ctl & 0x40) {
        out.push(v.getInt16(o));
        o += 2;
      } else out.push(v.getInt8(o++));
    }
  }
  return { deltas: out, next: o };
}

/** Interpolates deltas of untouched points of one contour from the touched ones (IUP, one axis). */
function iupContour(org: number[], delta: number[], touched: boolean[], start: number, end: number) {
  const idx: number[] = [];
  for (let i = start; i <= end; i++) if (touched[i]) idx.push(i);
  if (!idx.length) return;
  if (idx.length === 1) {
    for (let i = start; i <= end; i++) delta[i] = delta[idx[0]];
    return;
  }
  const n = end - start + 1;
  for (let k = 0; k < idx.length; k++) {
    const a = idx[k];
    const b = idx[(k + 1) % idx.length];
    let x1 = org[a];
    let x2 = org[b];
    let d1 = delta[a];
    let d2 = delta[b];
    if (x1 > x2) [x1, x2, d1, d2] = [x2, x1, d2, d1];
    for (let i = (a - start + 1) % n; i !== (b - start) % n; i = (i + 1) % n) {
      const p = start + i;
      const x = org[p];
      delta[p] = x1 === x2 ? (d1 === d2 ? d1 : 0) : x <= x1 ? d1 : x >= x2 ? d2 : d1 + ((x - x1) * (d2 - d1)) / (x2 - x1);
    }
  }
}

/** Opens a variable TrueType font; null when it has no glyf/gvar/fvar tables to work with. */
export function openVariableGlyf(sfnt: ArrayBuffer, axes: VarAxis[]): ((gid: number, coords: Record<string, number>) => Pt[][] | null) | null {
  const v = new DataView(sfnt);
  const glyf = findTable(v, 'glyf');
  const loca = findTable(v, 'loca');
  const gvar = findTable(v, 'gvar');
  const head = findTable(v, 'head');
  const maxp = findTable(v, 'maxp');
  if (!glyf || !loca || !gvar || !head || !maxp || !axes.length) return null;
  const longLoca = v.getInt16(head[0] + 50) === 1;
  const numGlyphs = v.getUint16(maxp[0] + 4);
  if (v.getUint16(gvar[0] + 4) !== axes.length) return null;
  const avar = readAvar(v);

  // gvar header
  const axisCount = axes.length;
  const sharedCount = v.getUint16(gvar[0] + 6);
  const sharedOff = gvar[0] + v.getUint32(gvar[0] + 8);
  const gvGlyphCount = v.getUint16(gvar[0] + 12);
  const longGv = !!(v.getUint16(gvar[0] + 14) & 1);
  const gvDataOff = gvar[0] + v.getUint32(gvar[0] + 16);
  const gvOffsets = gvar[0] + 20;
  const shared: number[][] = [];
  for (let i = 0; i < sharedCount; i++) shared.push(Array.from({ length: axisCount }, (_, a) => f2dot14(v, sharedOff + (i * axisCount + a) * 2)));

  const glyphRange = (gid: number): [number, number] => {
    const a = longLoca ? v.getUint32(loca[0] + gid * 4) : v.getUint16(loca[0] + gid * 2) * 2;
    const b = longLoca ? v.getUint32(loca[0] + gid * 4 + 4) : v.getUint16(loca[0] + gid * 2 + 2) * 2;
    return [glyf[0] + a, glyf[0] + b];
  };

  const rawCache = new Map<number, RawGlyph>();
  const readGlyph = (gid: number): RawGlyph => {
    const hit = rawCache.get(gid);
    if (hit) return hit;
    if (gid < 0 || gid >= numGlyphs) throw new Error('bad glyph id');
    const [s, e] = glyphRange(gid);
    let out: RawGlyph = { simple: { pts: [], ends: [] } };
    if (e > s) {
      const nContours = v.getInt16(s);
      let o = s + 10;
      if (nContours >= 0) {
        const ends = Array.from({ length: nContours }, (_, i) => v.getUint16(o + i * 2));
        o += nContours * 2;
        o += 2 + v.getUint16(o); // instructions
        const n = nContours ? ends[nContours - 1] + 1 : 0;
        const flags: number[] = [];
        while (flags.length < n) {
          const f = v.getUint8(o++);
          flags.push(f);
          if (f & 8) {
            let r = v.getUint8(o++);
            while (r-- > 0 && flags.length < n) flags.push(f);
          }
        }
        const coord = (shortBit: number, sameBit: number) => {
          const arr: number[] = [];
          let c = 0;
          for (const f of flags) {
            if (f & shortBit) {
              const d = v.getUint8(o++);
              c += f & sameBit ? d : -d;
            } else if (!(f & sameBit)) {
              c += v.getInt16(o);
              o += 2;
            }
            arr.push(c);
          }
          return arr;
        };
        const xs = coord(2, 16);
        const ys = coord(4, 32);
        out = { simple: { pts: flags.map((f, i) => ({ x: xs[i], y: ys[i], on: !!(f & 1) })), ends } };
      } else {
        const components: Component[] = [];
        let more = true;
        while (more) {
          const flags = v.getUint16(o);
          const cg = v.getUint16(o + 2);
          o += 4;
          let dx: number;
          let dy: number;
          if (flags & 1) {
            dx = flags & 2 ? v.getInt16(o) : v.getUint16(o);
            dy = flags & 2 ? v.getInt16(o + 2) : v.getUint16(o + 2);
            o += 4;
          } else {
            dx = flags & 2 ? v.getInt8(o) : v.getUint8(o);
            dy = flags & 2 ? v.getInt8(o + 1) : v.getUint8(o + 1);
            o += 2;
          }
          if (!(flags & 2)) throw new Error('point-matched component');
          let m: Component['m'] = [1, 0, 0, 1];
          if (flags & 8) {
            const sc = f2dot14(v, o);
            m = [sc, 0, 0, sc];
            o += 2;
          } else if (flags & 0x40) {
            m = [f2dot14(v, o), 0, 0, f2dot14(v, o + 2)];
            o += 4;
          } else if (flags & 0x80) {
            m = [f2dot14(v, o), f2dot14(v, o + 2), f2dot14(v, o + 4), f2dot14(v, o + 6)];
            o += 8;
          }
          components.push({ gid: cg, dx, dy, m });
          more = !!(flags & 0x20);
        }
        out = { components };
      }
    }
    rawCache.set(gid, out);
    return out;
  };

  /** Scalar of each tuple header at the normalized location, plus its deltas applied to `dx`/`dy`. */
  const applyDeltas = (gid: number, norm: number[], count: number, org: Pt[], ends: number[] | null, dx: number[], dy: number[]) => {
    if (gid >= gvGlyphCount) return;
    const a = longGv ? v.getUint32(gvOffsets + gid * 4) : v.getUint16(gvOffsets + gid * 2) * 2;
    const b = longGv ? v.getUint32(gvOffsets + gid * 4 + 4) : v.getUint16(gvOffsets + gid * 2 + 2) * 2;
    if (b <= a) return;
    const base = gvDataOff + a;
    const tvc = v.getUint16(base);
    const nTuples = tvc & 0x0fff;
    let dataPtr = base + v.getUint16(base + 2);
    let sharedPoints: number[] | null = null;
    if (tvc & 0x8000) {
      const r = readPackedPoints(v, dataPtr);
      sharedPoints = r.points;
      dataPtr = r.next;
    }
    let h = base + 4;
    for (let t = 0; t < nTuples; t++) {
      const size = v.getUint16(h);
      const idx = v.getUint16(h + 2);
      h += 4;
      let peak: number[];
      if (idx & 0x8000) {
        peak = Array.from({ length: axisCount }, (_, i) => f2dot14(v, h + i * 2));
        h += axisCount * 2;
      } else peak = shared[idx & 0x0fff];
      let start: number[] | null = null;
      let end: number[] | null = null;
      if (idx & 0x4000) {
        start = Array.from({ length: axisCount }, (_, i) => f2dot14(v, h + i * 2));
        end = Array.from({ length: axisCount }, (_, i) => f2dot14(v, h + (axisCount + i) * 2));
        h += axisCount * 4;
      }
      const dataStart = dataPtr;
      dataPtr += size;
      let scalar = 1;
      for (let i = 0; i < axisCount && scalar; i++) {
        const p = peak[i];
        if (p === 0) continue;
        const c = norm[i];
        const lo = start ? start[i] : Math.min(0, p);
        const hi = end ? end[i] : Math.max(0, p);
        if (c < lo || c > hi) scalar = 0;
        else if (c === p) continue;
        else if (c < p) scalar *= (c - lo) / (p - lo);
        else scalar *= (hi - c) / (hi - p);
      }
      if (!scalar) continue;
      let o = dataStart;
      let points = sharedPoints;
      if (idx & 0x2000) {
        const r = readPackedPoints(v, o);
        points = r.points;
        o = r.next;
      }
      const n = points ? points.length : count;
      const xr = readPackedDeltas(v, o, n);
      const yr = readPackedDeltas(v, xr.next, n);
      if (!points) {
        for (let i = 0; i < count; i++) {
          dx[i] += scalar * xr.deltas[i];
          dy[i] += scalar * yr.deltas[i];
        }
        continue;
      }
      const tx = new Array<number>(count).fill(0);
      const ty = new Array<number>(count).fill(0);
      const touched = new Array<boolean>(count).fill(false);
      points.forEach((p, i) => {
        if (p >= count) return;
        tx[p] = xr.deltas[i];
        ty[p] = yr.deltas[i];
        touched[p] = true;
      });
      if (ends) {
        const ox = org.map((p) => p.x);
        const oy = org.map((p) => p.y);
        let s = 0;
        for (const e of ends) {
          iupContour(ox, tx, touched, s, e);
          iupContour(oy, ty, touched, s, e);
          s = e + 1;
        }
      }
      for (let i = 0; i < count; i++) {
        dx[i] += scalar * tx[i];
        dy[i] += scalar * ty[i];
      }
    }
  };

  /** Contours (font units, y up) of a glyph at a normalized location. */
  const outline = (gid: number, norm: number[], depth = 0): Pt[][] => {
    if (depth > 8) throw new Error('component nesting too deep');
    const g = readGlyph(gid);
    if (g.simple) {
      const { pts, ends } = g.simple;
      const dx = new Array<number>(pts.length + 4).fill(0);
      const dy = new Array<number>(pts.length + 4).fill(0);
      if (pts.length) applyDeltas(gid, norm, pts.length + 4, pts, ends, dx, dy);
      const moved = pts.map((p, i) => ({ x: p.x + dx[i], y: p.y + dy[i], on: p.on }));
      const out: Pt[][] = [];
      let s = 0;
      for (const e of ends) {
        out.push(moved.slice(s, e + 1));
        s = e + 1;
      }
      return out;
    }
    const comps = g.components!;
    const dx = new Array<number>(comps.length + 4).fill(0);
    const dy = new Array<number>(comps.length + 4).fill(0);
    applyDeltas(gid, norm, comps.length + 4, comps.map((c) => ({ x: c.dx, y: c.dy, on: true })), null, dx, dy);
    return comps.flatMap((c, i) =>
      outline(c.gid, norm, depth + 1).map((contour) =>
        contour.map((p) => ({
          x: c.m[0] * p.x + c.m[2] * p.y + c.dx + dx[i],
          y: c.m[1] * p.x + c.m[3] * p.y + c.dy + dy[i],
          on: p.on,
        })),
      ),
    );
  };

  return (gid, coords) => {
    try {
      return outline(gid, normalizeCoords(axes, avar, coords));
    } catch {
      return null;
    }
  };
}

/** TrueType quadratic contours → path commands scaled to `fontSize`, baseline at (x, y), y down. */
export function contoursToCommands(contours: Pt[][], unitsPerEm: number, x: number, y: number, fontSize: number): OutlineCommand[] {
  const s = fontSize / unitsPerEm;
  const out: OutlineCommand[] = [];
  const X = (p: { x: number }) => x + p.x * s;
  const Y = (p: { y: number }) => y - p.y * s;
  for (const c of contours) {
    if (c.length < 2) continue;
    // Start on an on-curve point (a virtual midpoint when the contour has none).
    let pts = c;
    const first = c.findIndex((p) => p.on);
    if (first > 0) pts = [...c.slice(first), ...c.slice(0, first)];
    else if (first < 0) {
      const a = c[0];
      const b = c[c.length - 1];
      pts = [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true }, ...c];
    }
    out.push({ type: 'M', x: X(pts[0]), y: Y(pts[0]) });
    let off: Pt | null = null;
    const line = (p: Pt) => {
      if (off) out.push({ type: 'Q', x1: X(off), y1: Y(off), x: X(p), y: Y(p) });
      else out.push({ type: 'L', x: X(p), y: Y(p) });
      off = null;
    };
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.on) line(p);
      else {
        if (off) line({ x: (off.x + p.x) / 2, y: (off.y + p.y) / 2, on: true });
        off = p;
      }
    }
    line(pts[0]);
    out.push({ type: 'Z' });
  }
  return out;
}
