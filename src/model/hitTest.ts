import { boundsIn, localBounds, rectContains, rectsIntersect } from './bounds';
import { apply, fromTransform, invert, multiply, type Matrix } from './matrix';
import { flattenSubpaths, nodeSubpaths } from './path';
import type { DesignDocument, Id, Rect, SceneNode, Vec } from './types';

export interface HitOptions {
  /** Tolerance in world units (pass `px / zoom`). */
  tolerance?: number;
  /** Return the deepest leaf instead of the root-level ancestor. */
  deep?: boolean;
}

function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Winding number of polyline rings around p. */
function winding(p: Vec, rings: Vec[][]): number {
  let wn = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
      if (a.y <= p.y) {
        if (b.y > p.y && cross > 0) wn++;
      } else if (b.y <= p.y && cross < 0) wn--;
    }
  }
  return wn;
}

function crossings(p: Vec, rings: Vec[][]): number {
  let c = 0;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c++;
    }
  }
  return c;
}

/** Hit test of a single leaf node; `m` maps its local space to world. */
export function hitTestNode(node: SceneNode, m: Matrix, world: Vec, tolerance = 0): boolean {
  if (!node.visible) return false;
  if (node.type === 'group') {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const c = node.children[i];
      if (hitTestNode(c, multiply(m, fromTransform(c.transform)), world, tolerance)) return true;
    }
    return false;
  }
  // Quick reject with the world-space box.
  const wb = boundsIn(node, m);
  const strokeW = 'stroke' in node && node.stroke.paint.kind !== 'none' ? node.stroke.width / 2 : 0;
  const pad = tolerance + strokeW * Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  if (!wb || !rectContains({ x: wb.x - pad, y: wb.y - pad, width: wb.width + pad * 2, height: wb.height + pad * 2 }, world)) {
    return false;
  }
  const inv = invert(m);
  const p = apply(inv, world);
  const localScale = Math.max(Math.hypot(inv.a, inv.b), Math.hypot(inv.c, inv.d));
  const tol = tolerance * localScale + strokeW;

  if (node.type === 'text' || node.type === 'image') {
    const lb = localBounds(node)!;
    return rectContains({ x: lb.x - tol, y: lb.y - tol, width: lb.width + tol * 2, height: lb.height + tol * 2 }, p);
  }

  const sp = nodeSubpaths(node);
  if (!sp) return false;
  const flat = flattenSubpaths(sp);
  const hasFill = 'fill' in node && node.fill.kind !== 'none';
  if (hasFill) {
    // Open subpaths are filled as if closed (SVG behaviour).
    const rings = flat.map((f) => f.points).filter((r) => r.length > 2);
    const fillRule = node.type === 'path' ? node.fillRule : 'nonzero';
    const inside = fillRule === 'evenodd' ? crossings(p, rings) % 2 === 1 : winding(p, rings) !== 0;
    if (inside) return true;
  }
  // Edge hit (stroke or outline-only shapes are still clickable on their outline).
  const edgeTol = tol;
  for (const f of flat) {
    const pts = f.points;
    const n = f.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      if (distToSegment(p, pts[i], pts[(i + 1) % pts.length]) <= edgeTol) return true;
    }
  }
  return false;
}

/**
 * Topmost node under a world point. Hidden and locked nodes (and their subtrees) are skipped.
 * Returns the root-level ancestor unless `deep` is set.
 */
export function hitTest(doc: DesignDocument, world: Vec, opts: HitOptions = {}): Id | null {
  const tolerance = opts.tolerance ?? 0;
  const search = (nodes: SceneNode[], parentM: Matrix): Id | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!n.visible || n.locked || n.reference) continue;
      const m = multiply(parentM, fromTransform(n.transform));
      if (n.type === 'group') {
        const leaf = search(n.children, m);
        if (leaf) return opts.deep ? leaf : n.id;
      } else if (hitTestNode(n, m, world, tolerance)) {
        return n.id;
      }
    }
    return null;
  };
  return search(doc.children, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
}

/**
 * Topmost visible *reference* node under a world point (the one `hitTest` ignores), or null.
 * Used only to tell the user why a click selected nothing.
 */
export function hitTestReference(doc: DesignDocument, world: Vec, tolerance = 0): SceneNode | null {
  const inside = (n: SceneNode, parentM: Matrix): boolean => {
    const m = multiply(parentM, fromTransform(n.transform));
    if (n.type === 'group') return n.children.some((c) => c.visible && inside(c, m));
    return hitTestNode(n, m, world, tolerance);
  };
  const search = (nodes: SceneNode[], parentM: Matrix): SceneNode | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!n.visible) continue;
      if (n.reference) {
        if (inside(n, parentM)) return n;
      } else if (n.type === 'group') {
        const found = search(n.children, multiply(parentM, fromTransform(n.transform)));
        if (found) return found;
      }
    }
    return null;
  };
  return search(doc.children, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
}

/** Root-level (or all leaf, when deep) unlocked visible nodes whose world box intersects `rect`. */
export function nodesInRect(doc: DesignDocument, rect: Rect, opts: { deep?: boolean } = {}): Id[] {
  const out: Id[] = [];
  const visit = (nodes: SceneNode[], parentM: Matrix) => {
    for (const n of nodes) {
      if (!n.visible || n.locked || n.reference) continue;
      const m = multiply(parentM, fromTransform(n.transform));
      if (opts.deep && n.type === 'group') {
        visit(n.children, m);
        continue;
      }
      const b = boundsIn(n, m);
      if (b && rectsIntersect(b, rect)) out.push(n.id);
    }
  };
  visit(doc.children, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  return out;
}
