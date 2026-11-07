import { describe, expect, it } from 'vitest';
import {
  applyWorldMatrix,
  createDocument,
  createEllipse,
  createGroup,
  createPath,
  createPolygon,
  createRect,
  fromTransform,
  gradientVector,
  hitTest,
  invert,
  joinColor,
  localBounds,
  locate,
  multiply,
  nodeToSvgPath,
  nodesInRect,
  normalizeHex,
  scaleAbout,
  splitColor,
  toTransform,
  topmostIds,
  worldBounds,
  worldCorners,
  rotationAbout,
  IDENTITY,
  apply,
} from '..';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('factories', () => {
  it('creates nodes with defaults and unique ids', () => {
    const a = createRect();
    const b = createRect({ width: 20, transform: { x: 5 } });
    expect(a.id).not.toBe(b.id);
    expect(b.width).toBe(20);
    expect(b.transform).toEqual({ x: 5, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(createPolygon({ innerRadius: 10 }).name).toBe('Star');
  });
});

describe('paths', () => {
  it('renders a rect centered on origin', () => {
    expect(nodeToSvgPath(createRect({ width: 10, height: 4 }))).toBe('M-5 -2L5 -2L5 2L-5 2Z');
  });
  it('renders open and curved paths', () => {
    const p = createPath({
      subpaths: [{ closed: false, points: [{ x: 0, y: 0, type: 'corner', out: { x: 5, y: 0 } }, { x: 10, y: 10, type: 'corner' }] }],
    });
    expect(nodeToSvgPath(p)).toBe('M0 0C5 0 10 10 10 10');
  });
  it('polygon has `sides` vertices', () => {
    const d = nodeToSvgPath(createPolygon({ sides: 6 }));
    expect(d.match(/L/g)!.length).toBe(5);
  });
});

describe('bounds', () => {
  it('local bounds of primitives', () => {
    expect(localBounds(createEllipse({ rx: 3, ry: 2 }))).toEqual({ x: -3, y: -2, width: 6, height: 4 });
  });
  it('bezier bounds include curve extrema', () => {
    const p = createPath({
      subpaths: [
        {
          closed: false,
          points: [
            { x: 0, y: 0, type: 'corner', out: { x: 0, y: -10 } },
            { x: 10, y: 0, type: 'corner', in: { x: 10, y: -10 } },
          ],
        },
      ],
    });
    const b = localBounds(p)!;
    close(b.y, -7.5);
  });
  it('world bounds include rotation and parent transforms', () => {
    const r = createRect({ width: 10, height: 10, transform: { rotation: 45 } });
    const g = createGroup({ children: [r], transform: { x: 100, y: 50 } });
    const doc = createDocument({ children: [g] });
    const b = worldBounds(doc, r.id)!;
    const half = Math.SQRT2 * 5;
    close(b.x, 100 - half);
    close(b.width, half * 2);
    close(b.y, 50 - half);
    expect(worldCorners(doc, r.id)).toHaveLength(4);
    // group bounds = child bounds
    close(worldBounds(doc, g.id)!.width, half * 2);
  });
});

describe('matrix', () => {
  it('round-trips transforms', () => {
    const t = { x: 3, y: -4, rotation: 30, scaleX: 2, scaleY: -1.5 };
    const back = toTransform(fromTransform(t));
    close(back.x, 3);
    close(back.rotation, 30);
    close(back.scaleX, 2);
    close(back.scaleY, -1.5);
  });
  it('invert', () => {
    const m = fromTransform({ x: 3, y: -4, rotation: 30, scaleX: 2, scaleY: 1 });
    const id = multiply(m, invert(m));
    close(id.a, 1);
    close(id.e, 0);
    const p = apply(invert(m), apply(m, { x: 7, y: 9 }));
    close(p.x, 7);
  });
});

describe('transform ops', () => {
  it('scaling a rect bakes into width/height', () => {
    const r = createRect({ width: 10, height: 10 });
    const out = applyWorldMatrix(r, IDENTITY, scaleAbout(2, 3, { x: -5, y: -5 }));
    expect(out.width).toBe(20);
    expect(out.height).toBe(30);
    expect(out.transform.scaleX).toBe(1);
    close(out.transform.x, 5);
    close(out.transform.y, 10);
    expect(r.width).toBe(10); // original untouched
  });
  it('rotation about a point moves and rotates', () => {
    const r = createRect({ transform: { x: 10, y: 0 } });
    const out = applyWorldMatrix(r, IDENTITY, rotationAbout(90, { x: 0, y: 0 }));
    close(out.transform.x, 0);
    close(out.transform.y, 10);
    close(out.transform.rotation, 90);
  });
  it('scaling a rotated rect in its own frame keeps rotation', () => {
    const r = createRect({ width: 10, height: 10, transform: { rotation: 30 } });
    const out = applyWorldMatrix(r, IDENTITY, scaleAbout(2, 1, { x: 0, y: 0 }, 30));
    close(out.width, 20);
    close(out.height, 10);
    close(out.transform.rotation, 30);
  });
});

describe('hit testing', () => {
  const rect = createRect({ width: 100, height: 100, transform: { x: 50, y: 50 } });
  const ell = createEllipse({ rx: 10, ry: 10, transform: { x: 200, y: 200 } });
  const inner = createRect({ width: 10, height: 10, transform: { x: 300, y: 300 } });
  const group = createGroup({ children: [inner] });
  const doc = createDocument({ children: [rect, ell, group] });

  it('finds topmost node', () => {
    expect(hitTest(doc, { x: 50, y: 50 })).toBe(rect.id);
    expect(hitTest(doc, { x: 200, y: 200 })).toBe(ell.id);
    expect(hitTest(doc, { x: 209, y: 209 })).toBeNull(); // outside the circle, inside its box
    expect(hitTest(doc, { x: 500, y: 500 })).toBeNull();
  });
  it('returns group unless deep', () => {
    expect(hitTest(doc, { x: 300, y: 300 })).toBe(group.id);
    expect(hitTest(doc, { x: 300, y: 300 }, { deep: true })).toBe(inner.id);
  });
  it('marquee', () => {
    expect(nodesInRect(doc, { x: 0, y: 0, width: 20, height: 20 })).toEqual([rect.id]);
    expect(nodesInRect(doc, { x: 150, y: 150, width: 200, height: 200 })).toEqual([ell.id, group.id]);
  });
  it('tree helpers', () => {
    expect(locate(doc, inner.id)!.ancestors.map((a) => a.id)).toEqual([group.id]);
    expect(topmostIds(doc, [inner.id, group.id])).toEqual([group.id]);
  });
});

describe('paint', () => {
  it('colors', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(splitColor('#ff000080')).toEqual({ color: '#ff0000', opacity: 0.502 });
    expect(joinColor('#ff0000', 1)).toBe('#ff0000');
    expect(joinColor('#ff0000', 0.5)).toBe('#ff000080');
  });
  it('gradient vector', () => {
    expect(gradientVector(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    expect(gradientVector(90)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  });
});
