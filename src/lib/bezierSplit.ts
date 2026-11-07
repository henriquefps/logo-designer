export interface Pt {
  x: number;
  y: number;
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

/** Finds the curve parameter t (0..1) whose point is closest to `target`, by uniform sampling —
 * precise enough for locating a double-click position on a segment, no need for exact projection. */
export function nearestTOnCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, target: Pt, samples = 40): number {
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt = cubicAt(p0, p1, p2, p3, t);
    const dist = (pt.x - target.x) ** 2 + (pt.y - target.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestT = t;
    }
  }
  return bestT;
}

/** De Casteljau subdivision of a cubic Bézier at `t`: splits one curve into two cubics that
 * together retrace the original exactly, meeting at `point`. */
export function splitCubicBezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number) {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const f = lerp(d, e, t);
  return { left: [p0, a, d, f] as [Pt, Pt, Pt, Pt], right: [f, e, c, p3] as [Pt, Pt, Pt, Pt], point: f };
}
