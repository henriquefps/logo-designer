/**
 * Minimal GPOS pair-kerning reader. opentype.js 2.0 does not parse GPOS extension lookups (type 9),
 * which is where Inter, Montserrat, Playfair Display and many other fonts keep their `kern`
 * feature, so it reports 0 for every pair. This reads the `kern` feature's PairPos lookups
 * (format 1 and 2, directly or wrapped in extensions) straight from the sfnt bytes.
 * Only the first value record's xAdvance is used (what browsers apply for horizontal Latin text).
 */

import { readItemVarStore, type DeltaFn } from './itemVarStore';

/** Kerning in font units; `norm` (normalized axis coordinates) applies the font's variation deltas. */
export type KernFn = (left: number, right: number, norm?: number[]) => number;

interface Subtable {
  coverage: Map<number, number>;
  format: 1 | 2;
  // format 1: per coverage index, second glyph -> xAdvance
  pairSets?: Map<number, number>[];
  /** Variation delta indexes (outer * 65536 + inner) for the same pairs, where the font has them. */
  pairDevs?: Map<number, number>[];
  // format 2
  classDef1?: Map<number, number>;
  classDef2?: Map<number, number>;
  class2Count?: number;
  classValues?: Int16Array; // class1 * class2Count + class2
  classDevs?: Map<number, number>; // same index -> outer * 65536 + inner
}

const VALUE_FIELD_BITS = 8; // bits 0..7 of a ValueFormat each add one uint16

function valueSize(format: number): number {
  let n = 0;
  for (let b = 0; b < VALUE_FIELD_BITS; b++) if (format & (1 << b)) n++;
  return n * 2;
}

/** Offset (in bytes) of xAdvance inside a value record, or -1 when absent. */
function xAdvanceOffset(format: number): number {
  if (!(format & 0x0004)) return -1;
  let off = 0;
  if (format & 0x0001) off += 2; // xPlacement
  if (format & 0x0002) off += 2; // yPlacement
  return off;
}

/** Variation index of the xAdvance device table of a value record at `rec`, or -1. */
function xAdvanceDevice(v: DataView, rec: number, format: number, subtable: number): number {
  if (!(format & 0x0040)) return -1;
  let off = 0;
  for (let b = 0; b < 6; b++) if (format & (1 << b)) off += 2;
  const dev = v.getUint16(rec + off);
  if (!dev) return -1;
  const d = subtable + dev;
  return v.getUint16(d + 4) === 0x8000 ? v.getUint16(d) * 65536 + v.getUint16(d + 2) : -1;
}

/** Finds a table in an sfnt (TrueType/OpenType) font. Returns [offset, length] or null. */
export function findTable(view: DataView, tag: string): [number, number] | null {
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const t = String.fromCharCode(view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3));
    if (t === tag) return [view.getUint32(rec + 8), view.getUint32(rec + 12)];
  }
  return null;
}

function readCoverage(v: DataView, off: number): Map<number, number> {
  const map = new Map<number, number>();
  const format = v.getUint16(off);
  if (format === 1) {
    const count = v.getUint16(off + 2);
    for (let i = 0; i < count; i++) map.set(v.getUint16(off + 4 + i * 2), i);
  } else if (format === 2) {
    const count = v.getUint16(off + 2);
    for (let i = 0; i < count; i++) {
      const r = off + 4 + i * 6;
      const start = v.getUint16(r);
      const end = v.getUint16(r + 2);
      const startIndex = v.getUint16(r + 4);
      for (let g = start; g <= end; g++) map.set(g, startIndex + g - start);
    }
  }
  return map;
}

function readClassDef(v: DataView, off: number): Map<number, number> {
  const map = new Map<number, number>();
  const format = v.getUint16(off);
  if (format === 1) {
    const start = v.getUint16(off + 2);
    const count = v.getUint16(off + 4);
    for (let i = 0; i < count; i++) map.set(start + i, v.getUint16(off + 6 + i * 2));
  } else if (format === 2) {
    const count = v.getUint16(off + 2);
    for (let i = 0; i < count; i++) {
      const r = off + 4 + i * 6;
      const start = v.getUint16(r);
      const end = v.getUint16(r + 2);
      const cls = v.getUint16(r + 4);
      for (let g = start; g <= end; g++) map.set(g, cls);
    }
  }
  return map;
}

function readPairPos(v: DataView, off: number): Subtable | null {
  const posFormat = v.getUint16(off);
  const coverage = readCoverage(v, off + v.getUint16(off + 2));
  const vf1 = v.getUint16(off + 4);
  const vf2 = v.getUint16(off + 6);
  const xa = xAdvanceOffset(vf1);
  const s1 = valueSize(vf1);
  const s2 = valueSize(vf2);
  if (posFormat === 1) {
    const count = v.getUint16(off + 8);
    const pairSets: Map<number, number>[] = [];
    const pairDevs: Map<number, number>[] = [];
    for (let i = 0; i < count; i++) {
      const ps = off + v.getUint16(off + 10 + i * 2);
      const pairs = new Map<number, number>();
      const devs = new Map<number, number>();
      const n = v.getUint16(ps);
      const rec = 2 + s1 + s2;
      for (let j = 0; j < n; j++) {
        const r = ps + 2 + j * rec;
        const dev = xAdvanceDevice(v, r + 2, vf1, ps); // pair set records are relative to their PairSet table
        if (xa >= 0 || dev >= 0) pairs.set(v.getUint16(r), xa >= 0 ? v.getInt16(r + 2 + xa) : 0);
        if (dev >= 0) devs.set(v.getUint16(r), dev);
      }
      pairSets.push(pairs);
      pairDevs.push(devs);
    }
    return { coverage, format: 1, pairSets, pairDevs };
  }
  if (posFormat === 2) {
    const classDef1 = readClassDef(v, off + v.getUint16(off + 8));
    const classDef2 = readClassDef(v, off + v.getUint16(off + 10));
    const class1Count = v.getUint16(off + 12);
    const class2Count = v.getUint16(off + 14);
    const classValues = new Int16Array(class1Count * class2Count);
    const rec = s1 + s2;
    const classDevs = new Map<number, number>();
    for (let c1 = 0; c1 < class1Count; c1++) {
      for (let c2 = 0; c2 < class2Count; c2++) {
        const r = off + 16 + (c1 * class2Count + c2) * rec;
        if (xa >= 0) classValues[c1 * class2Count + c2] = v.getInt16(r + xa);
        const dev = xAdvanceDevice(v, r, vf1, off);
        if (dev >= 0) classDevs.set(c1 * class2Count + c2, dev);
      }
    }
    return { coverage, format: 2, classDef1, classDef2, class2Count, classValues, classDevs };
  }
  return null;
}

function subtableValue(st: Subtable, left: number, right: number, norm: number[] | undefined, delta: DeltaFn | null): number | null {
  const ci = st.coverage.get(left);
  if (ci === undefined) return null;
  let val: number;
  let dev: number | undefined;
  if (st.format === 1) {
    const base = st.pairSets![ci]?.get(right);
    if (base === undefined) return null;
    val = base;
    dev = st.pairDevs![ci]?.get(right);
  } else {
    const idx = (st.classDef1!.get(left) ?? 0) * st.class2Count! + (st.classDef2!.get(right) ?? 0);
    val = st.classValues![idx] ?? 0;
    dev = st.classDevs!.get(idx);
  }
  if (dev !== undefined && norm && delta) val += delta(Math.floor(dev / 65536), dev % 65536, norm);
  return val;
}

/**
 * Builds a kerning function (font units) from raw sfnt bytes, or null when the font has no GPOS
 * `kern` feature. Lookups apply in lookup-list order; within a lookup the first subtable whose
 * coverage contains the left glyph wins (OpenType rule). Values of separate lookups add up.
 */
export function readGposKerning(buffer: ArrayBuffer): KernFn | null {
  try {
    const v = new DataView(buffer);
    const t = findTable(v, 'GPOS');
    if (!t) return null;
    const g = t[0];
    const featureList = g + v.getUint16(g + 6);
    const lookupList = g + v.getUint16(g + 8);
    const lookupIdx = new Set<number>();
    const featureCount = v.getUint16(featureList);
    for (let i = 0; i < featureCount; i++) {
      const r = featureList + 2 + i * 6;
      const tag = String.fromCharCode(v.getUint8(r), v.getUint8(r + 1), v.getUint8(r + 2), v.getUint8(r + 3));
      if (tag !== 'kern') continue;
      const f = featureList + v.getUint16(r + 4);
      const n = v.getUint16(f + 2);
      for (let j = 0; j < n; j++) lookupIdx.add(v.getUint16(f + 4 + j * 2));
    }
    if (!lookupIdx.size) return null;
    const lookups: Subtable[][] = [];
    for (const li of [...lookupIdx].sort((a, b) => a - b)) {
      const l = lookupList + v.getUint16(lookupList + 2 + li * 2);
      const type = v.getUint16(l);
      const subCount = v.getUint16(l + 4);
      const subs: Subtable[] = [];
      for (let s = 0; s < subCount; s++) {
        let so = l + v.getUint16(l + 6 + s * 2);
        let st = type;
        if (type === 9) {
          st = v.getUint16(so + 2);
          so = so + v.getUint32(so + 4);
        }
        if (st !== 2) continue;
        const sub = readPairPos(v, so);
        if (sub) subs.push(sub);
      }
      if (subs.length) lookups.push(subs);
    }
    if (!lookups.length) return null;
    // Variable fonts (Inter, …) keep per-weight kerning as deltas in the GDEF item variation store.
    let delta: DeltaFn | null = null;
    const gdef = findTable(v, 'GDEF');
    if (gdef && v.getUint16(gdef[0] + 2) >= 3) {
      const storeOff = v.getUint32(gdef[0] + 14);
      if (storeOff) delta = readItemVarStore(v, gdef[0] + storeOff);
    }
    return (left, right, norm) => {
      let total = 0;
      for (const subs of lookups) {
        for (const st of subs) {
          const val = subtableValue(st, left, right, norm, delta);
          if (val !== null) {
            total += val;
            break;
          }
        }
      }
      return total;
    };
  } catch {
    return null;
  }
}
