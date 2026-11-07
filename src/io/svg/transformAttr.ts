import { fromTransform, IDENTITY, multiply, rotateAround, scale, toTransform, translate, type Matrix, type Transform } from '@/model';

/** Parses an SVG `transform` attribute (matrix, translate, scale, rotate, skewX, skewY; any number of them). */
export function parseTransform(value: string | null | undefined): Matrix {
  if (!value) return { ...IDENTITY };
  let m: Matrix = { ...IDENTITY };
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const args = (match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    let t: Matrix | null = null;
    switch (match[1]) {
      case 'matrix':
        if (args.length >= 6) t = { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
        break;
      case 'translate':
        t = translate(args[0] ?? 0, args[1] ?? 0);
        break;
      case 'scale':
        t = scale(args[0] ?? 1, args[1] ?? args[0] ?? 1);
        break;
      case 'rotate':
        t = rotateAround(args[0] ?? 0, { x: args[1] ?? 0, y: args[2] ?? 0 });
        break;
      case 'skewX':
        t = { a: 1, b: 0, c: Math.tan(((args[0] ?? 0) * Math.PI) / 180), d: 1, e: 0, f: 0 };
        break;
      case 'skewY':
        t = { a: 1, b: Math.tan(((args[0] ?? 0) * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
        break;
    }
    if (t && Object.values(t).every(Number.isFinite)) m = multiply(m, t);
  }
  return m;
}

/** A node Transform for `m` when it has no skew (translate · rotate · scale), else null. */
export function decompose(m: Matrix, eps = 1e-6): Transform | null {
  const t = toTransform(m);
  const back = fromTransform(t);
  const scaleRef = Math.max(1, Math.abs(m.a), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d));
  const close = (p: number, q: number, ref: number) => Math.abs(p - q) <= eps * ref;
  const ok =
    close(back.a, m.a, scaleRef) &&
    close(back.b, m.b, scaleRef) &&
    close(back.c, m.c, scaleRef) &&
    close(back.d, m.d, scaleRef) &&
    close(back.e, m.e, Math.max(1, Math.abs(m.e))) &&
    close(back.f, m.f, Math.max(1, Math.abs(m.f)));
  return ok ? t : null;
}

export const isIdentity = (m: Matrix, eps = 1e-9) =>
  Math.abs(m.a - 1) < eps && Math.abs(m.b) < eps && Math.abs(m.c) < eps && Math.abs(m.d - 1) < eps && Math.abs(m.e) < eps && Math.abs(m.f) < eps;

/** Average linear scale of a matrix (for stroke widths when baking). */
export const matrixScale = (m: Matrix) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
