// Knockout: cut the objects behind a "cutter" where the cutter sits, leaving a small gap, without
// adding a colour (app icon glyphs are one colour). Pure geometry through paper.js: no React, no
// stores, so the app (Object → Knock out) and the `designer knockout` CLI share it.
//
// Each target becomes target − (cutter's painted area grown by `gap`). Strokes are outlined first
// (cutter and targets), so stroked open paths work; the cutter itself is never changed.
import {
  createGroup,
  defaultStroke,
  fromTransform,
  invert,
  isPainted,
  locate,
  multiply,
  nodeSubpaths,
  parentWorldMatrix,
  sortByDocumentOrder,
  IDENTITY,
  type DesignDocument,
  type Id,
  type Matrix,
  type Paint,
  type PaintedNode,
  type SceneNode,
  type SubPath,
} from '@/model';
import { iconTile } from '@/icon/presets';
import { hasOutline, pathFromWorld } from './convert';
import { transformSubpaths } from './geometry';
import { fromPaper, outlineStroke, toPaper } from './paperOps';

type Scope = paper.PaperScope;
const NO_INSERT = { insert: false };

/** Default gap in app icon documents, as a fraction of the visible tile (≈ 4 units in 128). */
export const KNOCKOUT_GAP_TILE = 0.03;
/** Default gap in other documents, in document px. */
export const KNOCKOUT_GAP_PX = 4;

/** Default gap for a document, in document units (0.03 T on icon documents, else 4 px). */
export function defaultKnockoutGap(doc: Pick<DesignDocument, 'icon' | 'artboard'>): number {
  if (!doc.icon) return KNOCKOUT_GAP_PX;
  return Math.round(KNOCKOUT_GAP_TILE * iconTile(doc.icon.preset, doc.artboard).size * 1000) / 1000;
}

/** One unit of gap in the UI: tile fraction (icon documents) or px. */
export function gapUnit(doc: Pick<DesignDocument, 'icon' | 'artboard'>): { label: string; toDoc: (v: number) => number; fromDoc: (v: number) => number } {
  if (!doc.icon) return { label: 'px', toDoc: (v) => v, fromDoc: (v) => v };
  const t = iconTile(doc.icon.preset, doc.artboard).size;
  return { label: 'T', toDoc: (v) => v * t, fromDoc: (v) => v / t };
}

const visiblePaint = (p: Paint) => p.kind !== 'none';
const hasStroke = (n: PaintedNode) => visiblePaint(n.stroke.paint) && n.stroke.width > 0;

/** World-space area of a leaf's fill and of its outlined stroke (either may be null). */
export function leafAreas(scope: Scope, node: PaintedNode, world: Matrix): { fill: paper.PathItem | null; stroke: paper.PathItem | null } {
  const sp = nodeSubpaths(node);
  if (!sp?.length) return { fill: null, stroke: null };
  const fillRule = node.type === 'path' ? node.fillRule : 'nonzero';
  const fill = visiblePaint(node.fill) ? toPaper(scope, transformSubpaths(sp, world), fillRule, true) : null;
  let stroke: paper.PathItem | null = null;
  if (hasStroke(node)) {
    // Outlined in local space then mapped, so a scaled parent scales the stroke like SVG does.
    const outline = outlineStroke(scope, sp, node.stroke);
    if (outline.length) stroke = toPaper(scope, transformSubpaths(outline, world));
  }
  return { fill: fill && !fill.isEmpty() ? fill : null, stroke };
}

const unite = (a: paper.PathItem | null, b: paper.PathItem | null): paper.PathItem | null => (a && b ? a.unite(b, NO_INSERT) : (a ?? b));

/**
 * Painted area of a node in world space (`parentWorld` maps its parent to world): fills plus
 * outlined strokes, groups united. Hidden nodes, images and texts (outline them first) add nothing.
 * `solid`: closed shapes count as filled even without a fill (the object's silhouette, so an
 * outlined "sheet" hides what is behind it, not only its stroke band).
 */
export function nodeArea(scope: Scope, node: SceneNode, parentWorld: Matrix, solid = false): paper.PathItem | null {
  if (!node.visible) return null;
  const m = multiply(parentWorld, fromTransform(node.transform));
  if (node.type === 'group') return node.children.reduce<paper.PathItem | null>((acc, c) => unite(acc, nodeArea(scope, c, m, solid)), null);
  if (!hasOutline(node) || !isPainted(node)) return null;
  const { fill, stroke } = leafAreas(scope, node, m);
  let inside: paper.PathItem | null = null;
  if (solid && !fill) {
    const closed = (nodeSubpaths(node) ?? []).filter((s) => s.closed && s.points.length > 2);
    if (closed.length) inside = toPaper(scope, transformSubpaths(closed, m), node.type === 'path' ? node.fillRule : 'nonzero');
  }
  return unite(unite(fill, stroke), inside && !inside.isEmpty() ? inside : null);
}

/** The area grown by `gap` on every side (round corners): area ∪ a 2·gap wide band on its outline. */
export function expandArea(scope: Scope, area: paper.PathItem, gap: number): paper.PathItem {
  if (!(gap > 0)) return area;
  const band = outlineStroke(scope, fromPaper(area), { width: gap * 2, cap: 'round', join: 'round' });
  return band.length ? area.unite(toPaper(scope, band), NO_INSERT) : area;
}

/** The cut shape of one or more cutters: their united area (silhouette when `solid`) grown by `gap`. */
export function cutterShape(scope: Scope, cutters: { node: SceneNode; parentWorld: Matrix }[], gap: number, solid = true): paper.PathItem | null {
  const area = cutters.reduce<paper.PathItem | null>((acc, c) => unite(acc, nodeArea(scope, c.node, c.parentWorld, solid)), null);
  return area && !area.isEmpty() ? expandArea(scope, area, gap) : null;
}

const touches = (a: paper.PathItem, b: paper.PathItem) => a.bounds.intersects(b.bounds) && !a.intersect(b, NO_INSERT).isEmpty();
const within = (a: paper.PathItem, b: paper.PathItem) => a.subtract(b, NO_INSERT).isEmpty();

/** `area` minus (subtract) or inside (intersect) `shape`; null when nothing is left. */
function cutArea(area: paper.PathItem, shape: paper.PathItem, mode: CutMode): SubPath[] | null {
  const r = mode === 'subtract' ? area.subtract(shape, NO_INSERT) : area.intersect(shape, NO_INSERT);
  const sp = fromPaper(r).filter((s) => s.points.length >= 2);
  return sp.length ? sp : null;
}

/** subtract: knockout (remove what lies under the shape); intersect: clip (keep only what lies inside). */
export type CutMode = 'subtract' | 'intersect';

/**
 * Cuts one node (any depth) by `shape` (world space). Returns the replacement with the same id,
 * name, opacity and place, the same object when the cut changes nothing, or null when nothing is
 * left. Painted leaves that change become filled paths (strokes outlined); groups keep their
 * structure. Texts and images are returned as they are (outline texts first).
 */
export function cutNode(scope: Scope, node: SceneNode, parentWorld: Matrix, shape: paper.PathItem, mode: CutMode): SceneNode | null {
  if (!node.visible) return node;
  const m = multiply(parentWorld, fromTransform(node.transform));
  if (node.type === 'group') {
    let changed = false;
    const children: SceneNode[] = [];
    for (const c of node.children) {
      const r = cutNode(scope, c, m, shape, mode);
      if (r !== c) changed = true;
      if (r) children.push(r);
    }
    if (!changed) return node;
    return children.length ? { ...node, children } : null;
  }
  if (!hasOutline(node) || !isPainted(node)) return node;
  const { fill, stroke } = leafAreas(scope, node, m);
  const parts = [fill, stroke].filter((p): p is paper.PathItem => !!p);
  if (!parts.length) return node;
  if (mode === 'subtract' && !parts.some((p) => touches(p, shape))) return node;
  if (mode === 'intersect') {
    if (parts.every((p) => within(p, shape))) return node;
    if (!parts.some((p) => touches(p, shape))) return null;
  }
  const toParent = invert(parentWorld);
  const base = {
    name: node.name,
    visible: node.visible,
    locked: node.locked,
    ...(node.reference ? { reference: true } : {}),
    ...(node.blendMode ? { blendMode: node.blendMode } : {}),
  };
  const pieces: SceneNode[] = [];
  const fillCut = fill && cutArea(fill, shape, mode);
  if (fillCut) pieces.push(pathFromWorld(fillCut, toParent, { ...base, fill: structuredClone(node.fill), stroke: defaultStroke(), fillRule: 'evenodd' }));
  const strokeCut = stroke && cutArea(stroke, shape, mode);
  if (strokeCut) {
    const name = fillCut ? `${node.name} stroke` : node.name;
    pieces.push(pathFromWorld(strokeCut, toParent, { ...base, name, fill: structuredClone(node.stroke.paint), stroke: defaultStroke(), fillRule: 'evenodd' }));
  }
  if (!pieces.length) return null;
  if (pieces.length === 1) return { ...pieces[0], id: node.id, opacity: node.opacity };
  // Fill and stroke of different paints: a group in the parent's space, its children at full opacity.
  return { ...createGroup({ ...base, opacity: node.opacity, children: pieces }), id: node.id };
}

/** Knockout of one node: `cutNode(…, 'subtract')`. */
export const knockoutNode = (scope: Scope, node: SceneNode, parentWorld: Matrix, cut: paper.PathItem) => cutNode(scope, node, parentWorld, cut, 'subtract');

// ---------------------------------------------------------------------------------------------
// Document level (CLI and app)

export interface KnockoutRequest {
  cutters: Id[];
  /** Nodes to cut; default: everything painted below the cutters (`targetsBelow`). */
  targets?: Id[];
  /** Gap in document units (default: `defaultKnockoutGap`). */
  gap?: number;
  /**
   * Cut only under the cutter's painted strokes and fills, not inside its unfilled closed shapes
   * (default false: the cutter's whole silhouette hides what is behind it).
   */
  outlineOnly?: boolean;
  /** Stand-ins for nodes by id (texts already outlined). */
  resolved?: Map<Id, SceneNode>;
}

export interface KnockoutResult {
  /** Replacement nodes (same ids) for the targets that changed. */
  replace: SceneNode[];
  /** Targets that were cut away entirely. */
  remove: Id[];
  /** Targets that did not touch the cutter. */
  untouched: Id[];
  gap: number;
}

/**
 * Ids drawn below the cutters: earlier siblings of each cutter and of each of its ancestors
 * (minus the cutters and their ancestors).
 */
export function targetsBelow(doc: DesignDocument, cutters: Id[]): Id[] {
  const out = new Set<Id>();
  const exclude = new Set<Id>();
  for (const id of cutters) {
    const loc = locate(doc, id);
    if (!loc) continue;
    exclude.add(id);
    loc.ancestors.forEach((a) => exclude.add(a.id));
    const chain: SceneNode[] = [...loc.ancestors, loc.node];
    let parentChildren = doc.children;
    for (const n of chain) {
      const i = parentChildren.findIndex((c) => c.id === n.id);
      parentChildren.slice(0, i).forEach((c) => out.add(c.id));
      if (n.type === 'group') parentChildren = n.children;
    }
  }
  return sortByDocumentOrder(
    doc,
    [...out].filter((id) => !exclude.has(id)),
  );
}

/** Computes the knockout of `targets` by `cutters`. Throws when a cutter or target is missing. */
export function knockout(scope: Scope, doc: DesignDocument, req: KnockoutRequest): KnockoutResult {
  const gap = req.gap ?? defaultKnockoutGap(doc);
  const get = (id: Id) => {
    const n = req.resolved?.get(id) ?? locate(doc, id)?.node;
    if (!n) throw new Error(`No object with id ${id}`);
    return n;
  };
  const cut = cutterShape(
    scope,
    req.cutters.map((id) => ({ node: get(id), parentWorld: parentWorldMatrix(doc, id) })),
    gap,
    !req.outlineOnly,
  );
  const cutterSet = new Set(req.cutters);
  const targets = (req.targets ?? targetsBelow(doc, req.cutters)).filter((id) => !cutterSet.has(id));
  const result: KnockoutResult = { replace: [], remove: [], untouched: [], gap };
  for (const id of targets) {
    const node = get(id);
    const r = cut ? knockoutNode(scope, node, parentWorldMatrix(doc, id), cut) : node;
    if (r === node) result.untouched.push(id);
    else if (r) result.replace.push(r);
    else result.remove.push(id);
  }
  return result;
}

/** Applies a knockout result to a document (pure: returns a new document). */
export function applyKnockout(doc: DesignDocument, result: Pick<KnockoutResult, 'replace' | 'remove'>): DesignDocument {
  const byId = new Map(result.replace.map((n) => [n.id, n]));
  const removed = new Set(result.remove);
  const map = (nodes: SceneNode[]): SceneNode[] =>
    nodes.flatMap((n) => {
      if (removed.has(n.id)) return [];
      const r = byId.get(n.id);
      if (r) return [r];
      return n.type === 'group' ? [{ ...n, children: map(n.children) }] : [n];
    });
  return { ...doc, children: map(doc.children) };
}

/** World area of a node as subpaths (tests, diagnostics). */
export function nodeAreaSubpaths(scope: Scope, node: SceneNode, parentWorld: Matrix = IDENTITY): SubPath[] {
  const a = nodeArea(scope, node, parentWorld);
  return a ? fromPaper(a) : [];
}
