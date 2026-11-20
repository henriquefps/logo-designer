/**
 * OpenType ItemVariationStore (used by HVAR advances and by GPOS/GDEF device tables of variable
 * fonts), read from raw sfnt bytes. Deltas stay fractional, like in browsers; opentype.js rounds
 * every advance, which adds up to a visible drift over a line of text.
 */

import { findTable } from './kerning';

/** Delta (font units) for a (outer, inner) index at a normalized location. */
export type DeltaFn = (outer: number, inner: number, norm: number[]) => number;

interface Region {
  start: number[];
  peak: number[];
  end: number[];
}

const f2dot14 = (v: DataView, o: number) => v.getInt16(o) / 16384;

function regionScalar(r: Region, norm: number[]): number {
  let s = 1;
  for (let i = 0; i < r.peak.length; i++) {
    const p = r.peak[i];
    const lo = r.start[i];
    const hi = r.end[i];
    if (p === 0 || lo > p || p > hi || (lo < 0 && hi > 0)) continue;
    const c = norm[i] ?? 0;
    if (c < lo || c > hi) return 0;
    if (c === p) continue;
    s *= c < p ? (c - lo) / (p - lo) : (hi - c) / (hi - p);
  }
  return s;
}

/** Parses the store at `off` (absolute offset of its ItemVariationStore header). */
export function readItemVarStore(v: DataView, off: number): DeltaFn {
  const regionListOff = off + v.getUint32(off + 2);
  const axisCount = v.getUint16(regionListOff);
  const regionCount = v.getUint16(regionListOff + 2);
  const regions: Region[] = [];
  for (let i = 0; i < regionCount; i++) {
    const r = regionListOff + 4 + i * axisCount * 6;
    const at = (k: number) => Array.from({ length: axisCount }, (_, a) => f2dot14(v, r + a * 6 + k * 2));
    regions.push({ start: at(0), peak: at(1), end: at(2) });
  }
  const dataCount = v.getUint16(off + 6);
  const datas = Array.from({ length: dataCount }, (_, i) => {
    const d = off + v.getUint32(off + 8 + i * 4);
    const itemCount = v.getUint16(d);
    const wordCountRaw = v.getUint16(d + 2);
    const long = !!(wordCountRaw & 0x8000);
    const wordCount = wordCountRaw & 0x7fff;
    const regionIdx = Array.from({ length: v.getUint16(d + 4) }, (_, k) => v.getUint16(d + 6 + k * 2));
    return { d: d + 6 + regionIdx.length * 2, itemCount, long, wordCount, regionIdx };
  });
  return (outer, inner, norm) => {
    const data = datas[outer];
    if (!data || inner >= data.itemCount) return 0;
    const wsz = data.long ? 4 : 2;
    const rowSize = data.wordCount * wsz + (data.regionIdx.length - data.wordCount);
    let o = data.d + inner * rowSize;
    let total = 0;
    for (let k = 0; k < data.regionIdx.length; k++) {
      let delta: number;
      if (k < data.wordCount) {
        delta = data.long ? v.getInt32(o) : v.getInt16(o);
        o += wsz;
      } else delta = v.getInt8(o++);
      if (delta) total += delta * regionScalar(regions[data.regionIdx[k]], norm);
    }
    return total;
  };
}

/** Variable advance deltas from HVAR (font units, fractional), or null when the font has none. */
export function readHvarAdvance(buffer: ArrayBuffer): ((gid: number, norm: number[]) => number) | null {
  try {
    const v = new DataView(buffer);
    const t = findTable(v, 'HVAR');
    if (!t) return null;
    const delta = readItemVarStore(v, t[0] + v.getUint32(t[0] + 4));
    const mapRel = v.getUint32(t[0] + 8);
    if (!mapRel) return (gid, norm) => delta(0, gid, norm);
    const m = t[0] + mapRel;
    const entryFormat = v.getUint8(m + 1);
    const long = v.getUint8(m) === 1;
    const count = long ? v.getUint32(m + 2) : v.getUint16(m + 2);
    const base = m + (long ? 6 : 4);
    const size = ((entryFormat >> 4) & 3) + 1;
    const innerBits = (entryFormat & 0xf) + 1;
    return (gid, norm) => {
      if (!count) return 0;
      const o = base + Math.min(gid, count - 1) * size;
      let e = 0;
      for (let i = 0; i < size; i++) e = e * 256 + v.getUint8(o + i);
      return delta(Math.floor(e / 2 ** innerBits), e % 2 ** innerBits, norm);
    };
  } catch {
    return null;
  }
}
