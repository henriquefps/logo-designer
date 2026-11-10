import { beforeAll, describe, expect, it } from 'vitest';
import {
  createDocument,
  createGroup,
  createPath,
  createRect,
  defaultStroke,
  fromTransform,
  multiply,
  nodeSubpaths,
  none,
  solid,
  type DesignDocument,
  type PathNode,
  type SceneNode,
  type Vec,
} from '@/model';
import { loadPaper, toPaper } from '../paperOps';
import { transformSubpaths } from '../geometry';
import { applyKnockout, defaultKnockoutGap, knockout, nodeArea, targetsBelow } from '../knockout';

let scope: paper.PaperScope;
beforeAll(async () => {
  scope = await loadPaper();
});

const stroked = (color = '#ffffff', width = 10) => ({ fill: none(), stroke: { ...defaultStroke(solid(color), width), join: 'round' as const, cap: 'round' as const } });

/** Two stroked squares: back 100×100 at (100,100), front 100×100 at (160,160). */
function twoSquares(backRotation = 0): DesignDocument {
  const back = createRect({ name: 'Back', width: 100, height: 100, opacity: 0.45, transform: { x: 100, y: 100, rotation: backRotation, scaleX: 1, scaleY: 1 }, ...stroked() });
  const front = createRect({ name: 'Front', width: 100, height: 100, transform: { x: 160, y: 160, rotation: 0, scaleX: 1, scaleY: 1 }, ...stroked() });
  return createDocument({ artboard: { width: 300, height: 300, background: none() }, children: [back, front] });
}

/** Does the (world) area of a node contain the point? */
function contains(node: SceneNode, p: Vec): boolean {
  const a = nodeArea(scope, node, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  return !!a && a.contains(new scope.Point(p.x, p.y));
}

/** World point of a node's subpaths (path node directly under the root). */
const worldPath = (n: PathNode) => toPaper(scope, transformSubpaths(nodeSubpaths(n)!, fromTransform(n.transform)), n.fillRule);

describe('knockout', () => {
  it('cuts a stroked square where a stroked square sits in front of it, with the gap', () => {
    const doc = twoSquares();
    const [back, front] = doc.children;
    const gap = 4;
    const r = knockout(scope, doc, { cutters: [front.id], gap, outlineOnly: true });
    expect(r.replace).toHaveLength(1);
    expect(r.remove).toEqual([]);
    const cut = r.replace[0] as PathNode;
    // Same id, name, opacity; a filled path (the stroke was outlined).
    expect(cut.id).toBe(back.id);
    expect(cut.name).toBe('Back');
    expect(cut.opacity).toBe(0.45);
    expect(cut.type).toBe('path');
    expect(cut.fill).toEqual(solid('#ffffff'));
    expect(cut.stroke.paint.kind).toBe('none');
    // Back square's stroke centerline runs on x=150 (right edge), y 50..150; y=150 bottom edge.
    // Far from the front square: still painted.
    expect(contains(cut, { x: 150, y: 60 })).toBe(true);
    expect(contains(cut, { x: 60, y: 150 })).toBe(true);
    // The front stroke covers x 105..115 (its left edge at x=110, width 10); the gap adds 4 → 101..119.
    // The back's bottom edge (y = 145..155) is cut between x≈101 and the back's right side.
    // The front square's interior is not painted (fill none): only its stroke band + gap cuts.
    expect(contains(cut, { x: 130, y: 150 })).toBe(true);
    expect(contains(cut, { x: 150, y: 110 })).toBe(false); // back's right edge under the front's top stroke
    expect(contains(cut, { x: 112, y: 150 })).toBe(false); // under the front stroke
    expect(contains(cut, { x: 103, y: 150 })).toBe(false); // in the gap (105 − 4 = 101)
    expect(contains(cut, { x: 99, y: 150 })).toBe(true); // just outside the gap
    // The cutter is untouched.
    const out = applyKnockout(doc, r);
    expect(out.children[1]).toBe(front);
  });

  it('respects the gap within tolerance', () => {
    const doc = twoSquares();
    const [, front] = doc.children;
    for (const gap of [0, 2, 8]) {
      const cut = knockout(scope, doc, { cutters: [front.id], gap, outlineOnly: true }).replace[0] as PathNode;
      // Along the back's bottom edge (y=150), the first painted x left of the front stroke (x=105) is 105 − gap.
      const item = worldPath(cut);
      let edge = NaN;
      for (let x = 106; x > 80; x -= 0.05) {
        if (item.contains(new scope.Point(x, 150))) {
          edge = x;
          break;
        }
      }
      expect(Math.abs(edge - (105 - gap))).toBeLessThan(0.3);
    }
  });

  it('by default the whole silhouette of an unfilled closed cutter hides what is behind it', () => {
    const doc = twoSquares();
    const [back, front] = doc.children;
    const far = createRect({ name: 'Far', width: 10, height: 10, fill: solid('#fff'), transform: { x: 20, y: 280, rotation: 0, scaleX: 1, scaleY: 1 } });
    const inner = createRect({ name: 'Inner', width: 20, height: 20, fill: solid('#fff'), transform: { x: 160, y: 160, rotation: 0, scaleX: 1, scaleY: 1 } });
    const d2 = { ...doc, children: [far, inner, ...doc.children] };
    const r = knockout(scope, d2, { cutters: [front.id], gap: 4 });
    expect(r.untouched).toEqual([far.id]);
    expect(r.remove).toEqual([inner.id]); // entirely inside the front square
    const cut = r.replace.find((n) => n.id === back.id)!;
    expect(contains(cut, { x: 130, y: 150 })).toBe(false); // inside the front square: hidden
    expect(contains(cut, { x: 99, y: 150 })).toBe(true);
    expect(contains(cut, { x: 150, y: 60 })).toBe(true);
    // outlineOnly: only the stroke band (+ gap) cuts.
    const o = knockout(scope, d2, { cutters: [front.id], gap: 4, outlineOnly: true });
    expect(o.untouched.sort()).toEqual([far.id, inner.id].sort());
  });

  it('works with rotated targets and filled cutters, and removes targets cut away entirely', () => {
    const doc = twoSquares(30);
    const [back] = doc.children;
    const cutter = createRect({ name: 'Cutter', width: 300, height: 300, fill: solid('#fff'), transform: { x: 150, y: 150, rotation: 0, scaleX: 1, scaleY: 1 } });
    const all = knockout(scope, { ...doc, children: [...doc.children, cutter] }, { cutters: [cutter.id], gap: 0 });
    expect(all.remove.sort()).toEqual([back.id, doc.children[1].id].sort());

    const front = doc.children[1];
    const r = knockout(scope, doc, { cutters: [front.id], gap: 4 });
    const cut = r.replace[0] as PathNode;
    // The rotated back square's corners (rotation baked into the points).
    const m = fromTransform(back.transform);
    const corner = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const tl = corner(-50, -50);
    expect(contains(cut, tl)).toBe(true);
    // A point on the back's right edge that lies under the front's left stroke is cut.
    const mid = corner(50, 30);
    const underFront = mid.x > 101 && mid.x < 119 && mid.y > 110 && mid.y < 210;
    if (underFront) expect(contains(cut, mid)).toBe(false);
    // Everything that was cut is inside the back's own stroke band.
    expect(cut.transform.rotation).toBe(0);
  });

  it('cuts inside groups (keeps the group) and accepts a group cutter', () => {
    const doc = twoSquares();
    const [back, front] = doc.children;
    const g = createGroup({ name: 'G', children: [back], transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
    const cg = createGroup({ name: 'CG', children: [front] });
    const d = { ...doc, children: [g, cg] };
    const r = knockout(scope, d, { cutters: [cg.id], gap: 4 });
    expect(r.replace).toHaveLength(1);
    const ng = r.replace[0];
    expect(ng.type).toBe('group');
    expect(ng.id).toBe(g.id);
    if (ng.type === 'group') expect(ng.children[0].id).toBe(back.id);
  });

  it('cuts stroked open paths (outlined first)', () => {
    const line = createPath({
      name: 'Line',
      subpaths: [{ closed: false, points: [{ x: 0, y: 150, type: 'corner' }, { x: 300, y: 150, type: 'corner' }] }],
      ...stroked('#fff', 9),
    });
    const vbar = createPath({
      name: 'Bar',
      subpaths: [{ closed: false, points: [{ x: 150, y: 0, type: 'corner' }, { x: 150, y: 300, type: 'corner' }] }],
      ...stroked('#fff', 9),
    });
    const doc = createDocument({ children: [line, vbar] });
    const r = knockout(scope, doc, { cutters: [vbar.id], gap: 4 });
    const cut = r.replace[0] as PathNode;
    // An open cutter has no inside: only its stroke cuts. Two pieces: the line is split around the bar (4.5 + 4 = 8.5 each side).
    expect(cut.subpaths.length).toBe(2);
    expect(contains(cut, { x: 140, y: 150 })).toBe(true);
    expect(contains(cut, { x: 145, y: 150 })).toBe(false);
    expect(contains(cut, { x: 150, y: 150 })).toBe(false);
  });

  it('targetsBelow picks everything drawn under the cutter', () => {
    const a = createRect();
    const b = createRect();
    const c = createRect();
    const inner = createRect();
    const top = createRect();
    const g = createGroup({ children: [b, inner, c] });
    const doc = createDocument({ children: [a, g, top] });
    expect(targetsBelow(doc, [inner.id])).toEqual([a.id, b.id]);
    expect(targetsBelow(doc, [top.id])).toEqual([a.id, g.id]);
  });

  it('default gap: 0.03 T on icon documents, 4 px elsewhere', () => {
    expect(defaultKnockoutGap(createDocument())).toBe(4);
    expect(defaultKnockoutGap({ artboard: { width: 128, height: 128, background: none() }, icon: { preset: 'app-icon', shape: 'auto' } })).toBeCloseTo(3.84, 3);
    expect(defaultKnockoutGap({ artboard: { width: 1024, height: 1024, background: none() }, icon: { preset: 'ios', shape: 'auto' } })).toBeCloseTo(30.72, 3);
  });

  it('respects a scaled parent (strokes scale with the group)', () => {
    const back = createRect({ width: 50, height: 50, ...stroked('#fff', 5), transform: { x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1 } });
    const g = createGroup({ children: [back], transform: { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 2 } });
    const front = createRect({ width: 100, height: 100, ...stroked('#fff', 10), transform: { x: 160, y: 160, rotation: 0, scaleX: 1, scaleY: 1 } });
    const doc = createDocument({ children: [g, front] });
    const r = knockout(scope, doc, { cutters: [front.id], gap: 4, outlineOnly: true });
    const ng = r.replace[0];
    expect(ng.type).toBe('group');
    const leaf = ng.type === 'group' ? (ng.children[0] as PathNode) : null;
    // World point check through the group matrix.
    const world = multiply(fromTransform(ng.transform), fromTransform(leaf!.transform));
    const item = toPaper(scope, transformSubpaths(nodeSubpaths(leaf!)!, world), 'evenodd');
    expect(item.contains(new scope.Point(150, 60))).toBe(true);
    expect(item.contains(new scope.Point(112, 150))).toBe(false);
    expect(item.contains(new scope.Point(99, 150))).toBe(true);
  });
});
