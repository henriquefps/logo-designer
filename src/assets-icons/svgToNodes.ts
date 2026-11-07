import { createGroup, createPath } from '@/model/factories';
import { fromTransform, multiply, scale as scaleM, translate, type Matrix } from '@/model/matrix';
import { nodeSubpaths } from '@/model/path';
import type { PathNode, SceneNode } from '@/model/types';
import { parseSvg } from '@/io/svgImport';
import { transformSubpaths } from '@/io/svg/pathData';

/**
 * Icon SVG → editable nodes, through the full SVG importer (`io/svgImport.ts`: styles, classes,
 * gradients, transforms, `<use>`), so icons and imported files behave the same.
 */

export interface SvgToNodesOptions {
  /** Value of `currentColor`. #rrggbb. */
  color: string;
  /** Size in document px of the icon's longest viewBox side. */
  size: number;
  /** Overrides the stroke width of every stroked element, in icon units (scaled with the icon). null/undefined keeps the original. */
  strokeWidth?: number | null;
  name?: string;
}

/** Uniform scale of a matrix (stroke widths). */
const matrixScale = (m: Matrix) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;

/**
 * Bakes every transform into path points (primitives become paths), so the result has identity
 * transforms with the icon centered on the origin. Text and images are dropped (icons don't need them).
 */
function bake(node: SceneNode, parent: Matrix, strokeScale: number, strokeOverride: number | null): SceneNode | null {
  const m = multiply(parent, fromTransform(node.transform));
  if (node.type === 'group') {
    const children = node.children.map((c) => bake(c, m, strokeScale, strokeOverride)).filter((c): c is SceneNode => !!c);
    if (!children.length) return null;
    // A wrapper group with one child and no own effect is just that child.
    if (children.length === 1 && node.opacity === 1 && !node.blendMode && node.visible) return children[0];
    return { ...createGroup({ name: node.name, children }), opacity: node.opacity, visible: node.visible, ...(node.blendMode ? { blendMode: node.blendMode } : {}) };
  }
  if (node.type === 'text' || node.type === 'image') return null;
  const sps = nodeSubpaths(node);
  if (!sps?.length) return null;
  const k = matrixScale(m);
  const stroked = node.stroke.paint.kind !== 'none' && node.stroke.width > 0;
  const width = stroked ? (strokeOverride !== null ? strokeOverride * strokeScale : node.stroke.width * k) : 0;
  return createPath({
    name: node.name,
    subpaths: transformSubpaths(sps, m),
    fill: node.fill,
    stroke: { ...node.stroke, width, dash: node.stroke.dash.map((d) => d * k) },
    fillRule: node.type === 'path' ? node.fillRule : 'nonzero',
    opacity: node.opacity,
    visible: node.visible,
    ...(node.blendMode ? { blendMode: node.blendMode } : {}),
  });
}

/**
 * Converts icon SVG markup into a centered node (origin = icon center). Returns a single `path` when the
 * icon has one shape, else a `group` of paths. Null when nothing drawable was found.
 */
export function svgToNodes(svgSrc: string, opts: SvgToNodesOptions): SceneNode | null {
  let first;
  try {
    first = parseSvg(svgSrc, { currentColor: opts.color });
  } catch {
    return null;
  }
  const w = first.width || 24;
  const h = first.height || w;
  const s = opts.size / Math.max(w, h);
  // Scale to size and center on the origin.
  const root = multiply(scaleM(s), translate(-w / 2, -h / 2));
  const nodes = first.nodes
    .map((n) => bake(n, root, s, opts.strokeWidth ?? null))
    .filter((n): n is SceneNode => !!n);
  if (!nodes.length) return null;
  if (nodes.length === 1 && nodes[0].type === 'path') {
    const p = nodes[0] as PathNode;
    if (opts.name) p.name = opts.name;
    return p;
  }
  return createGroup({ name: opts.name ?? 'Icon', children: nodes });
}
