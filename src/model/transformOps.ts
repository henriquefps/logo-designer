import { fromTransform, invert, multiply, rotateAround, scale, toTransform, translate, type Matrix } from './matrix';
import type { BezierPoint, SceneNode, Vec } from './types';

const sign = (n: number) => (n < 0 ? -1 : 1);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Folds the node's scale into its geometry where the type allows it, so resizing a rectangle
 * changes width/height instead of scaling its stroke. Groups keep their scale.
 * Mutates and returns `node`.
 */
export function bakeScale<T extends SceneNode>(node: T): T {
  const t = node.transform;
  const ax = Math.abs(t.scaleX);
  const ay = Math.abs(t.scaleY);
  if (near(ax, 1) && near(ay, 1)) return node;
  switch (node.type) {
    case 'rect':
      node.width *= ax;
      node.height *= ay;
      node.radius *= Math.min(ax, ay);
      break;
    case 'image':
      node.width *= ax;
      node.height *= ay;
      break;
    case 'ellipse':
      node.rx *= ax;
      node.ry *= ay;
      break;
    case 'path': {
      const sx = t.scaleX;
      const sy = t.scaleY;
      const sc = (p: Vec) => ({ x: p.x * sx, y: p.y * sy });
      node.subpaths = node.subpaths.map((sp) => ({
        closed: sp.closed,
        points: sp.points.map((p): BezierPoint => {
          const q: BezierPoint = { ...p, ...sc(p) };
          if (p.in) q.in = sc(p.in);
          if (p.out) q.out = sc(p.out);
          return q;
        }),
      }));
      node.transform = { ...t, scaleX: 1, scaleY: 1 };
      return node;
    }
    case 'polygon':
      if (!near(ax, ay)) return node;
      node.radius *= ax;
      if (node.innerRadius !== undefined) node.innerRadius *= ax;
      break;
    case 'text':
      if (!near(ax, ay)) return node;
      node.fontSize *= ax;
      node.letterSpacing *= ax;
      break;
    default:
      return node;
  }
  node.transform = { ...t, scaleX: sign(t.scaleX), scaleY: sign(t.scaleY) };
  return node;
}

/**
 * Returns a copy of `node` with the world-space matrix `m` applied on top of its current
 * placement. `parentWorld` maps the node's parent space to world. Skew is dropped.
 */
export function applyWorldMatrix<T extends SceneNode>(node: T, parentWorld: Matrix, m: Matrix): T {
  const local = multiply(invert(parentWorld), multiply(m, multiply(parentWorld, fromTransform(node.transform))));
  const t = toTransform(local);
  // Keep the original rotation sign convention when nothing rotated (avoids -0 noise / 180° flips).
  const copy = structuredClone(node) as T;
  copy.transform = cleanTransform(t);
  return bakeScale(copy);
}

function cleanTransform(t: ReturnType<typeof toTransform>) {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  let { rotation, scaleX, scaleY } = t;
  // A flip in both axes is a 180° rotation; prefer positive scales.
  if (scaleX < 0 && scaleY < 0) {
    scaleX = -scaleX;
    scaleY = -scaleY;
    rotation = rotation > 0 ? rotation - 180 : rotation + 180;
  }
  return { x: r(t.x), y: r(t.y), rotation: r(rotation), scaleX: r(scaleX), scaleY: r(scaleY) };
}

/** World matrix scaling by (kx, ky) about `anchor`, inside a frame rotated by `rotation` degrees. */
export function scaleAbout(kx: number, ky: number, anchor: Vec, rotation = 0): Matrix {
  const toFrame = multiply(translate(anchor.x, anchor.y), rotateAround(rotation, { x: 0, y: 0 }));
  return multiply(toFrame, multiply(scale(kx, ky), invert(toFrame)));
}

export const rotationAbout = (deg: number, center: Vec): Matrix => rotateAround(deg, center);
export const translation = (dx: number, dy: number): Matrix => translate(dx, dy);
