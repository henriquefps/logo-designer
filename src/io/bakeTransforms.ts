// Bakes every group/node transform into plain geometry (the glyph for build-icons.mjs and the splash
// converter must be transform-free): paths get their points transformed, circles/rects/ellipses stay
// shapes when the world matrix is a translation plus a uniform scale (else they become paths), polygons
// and text outlines become paths, stroke widths and dashes scale with the geometry. Groups keep their
// structure (opacity, order) with an identity transform. Nodes that only translate are left untouched
// (the exporter absorbs a translation), so untransformed documents export byte-identically.
import {
  fromTransform,
  isPainted,
  multiply,
  type DesignDocument,
  type Matrix,
  type SceneNode,
  type Transform,
} from '@/model';
import { shapeToPath } from '@/vector/convert';
import { transformSubpaths } from './svg/pathData';
import { outlineText } from './outlineText';

const EPS = 1e-9;
const ID: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const IDENTITY_T: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const isTranslation = (m: Matrix) => Math.abs(m.a - 1) < EPS && Math.abs(m.d - 1) < EPS && Math.abs(m.b) < EPS && Math.abs(m.c) < EPS;
const uniformScale = (m: Matrix) => (Math.abs(m.b) < EPS && Math.abs(m.c) < EPS && m.a > 0 && Math.abs(m.a - m.d) < EPS ? m.a : null);
const translateOf = (m: Matrix): Transform => ({ ...IDENTITY_T, x: m.e, y: m.f });

function scaleStroke<T extends SceneNode>(node: T, k: number): T {
  if (isPainted(node) && k !== 1) node.stroke = { ...node.stroke, width: node.stroke.width * k, dash: node.stroke.dash.map((d) => d * k) };
  return node;
}

async function bake(node: SceneNode, parent: Matrix): Promise<SceneNode> {
  if (node.type === 'text') {
    const outlined = await outlineText(node);
    if (outlined) return bake({ ...outlined, id: node.id }, parent);
  }
  const world = multiply(parent, fromTransform(node.transform));
  if (node.type === 'group') {
    const children = await Promise.all(node.children.map((c) => bake(c, world)));
    return { ...node, transform: { ...IDENTITY_T }, children };
  }
  if (isTranslation(world)) {
    const t = translateOf(world);
    const same = (['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const).every((k) => Math.abs(t[k] - node.transform[k]) < EPS);
    return same ? node : { ...structuredClone(node), transform: t };
  }
  const out = structuredClone(node);
  const k = Math.sqrt(Math.abs(world.a * world.d - world.b * world.c));
  const s = uniformScale(world);
  if (s !== null && out.type === 'rect') {
    out.width *= s;
    out.height *= s;
    out.radius *= s;
    out.transform = translateOf(world);
    return scaleStroke(out, s);
  }
  if (s !== null && out.type === 'ellipse') {
    out.rx *= s;
    out.ry *= s;
    out.transform = translateOf(world);
    return scaleStroke(out, s);
  }
  const asPath = out.type === 'path' ? out : shapeToPath(out);
  if (asPath) return scaleStroke({ ...asPath, subpaths: transformSubpaths(asPath.subpaths, world), transform: { ...IDENTITY_T } }, k);
  return out; // images, live text: left as they are
}

/** The document with all transforms baked into geometry (see the file comment). */
export async function bakeTransforms(doc: DesignDocument): Promise<DesignDocument> {
  return { ...doc, children: await Promise.all(doc.children.map((n) => bake(n, ID))) };
}
