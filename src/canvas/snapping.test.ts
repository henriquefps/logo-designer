import { describe, expect, it } from 'vitest';
import { computeSnapTargets, snapPoint, snapRect } from './snapping';

describe('snapping', () => {
  const targets = computeSnapTargets({ width: 100, height: 100 }, [{ x: 200, y: 0, width: 50, height: 50 }]);
  it('snaps a box center to the artboard center', () => {
    const r = snapRect({ x: 23, y: 10, width: 50, height: 10 }, targets, 3);
    expect(r.dx).toBe(2);
    expect(r.guides).toEqual([{ axis: 'x', position: 50 }]);
  });
  it('snaps edges to other objects', () => {
    const r = snapRect({ x: 151, y: 52, width: 47, height: 10 }, targets, 3);
    expect(r.dx).toBe(2);
    expect(r.dy).toBe(-2);
  });
  it('leaves far boxes alone', () => {
    expect(snapRect({ x: 130, y: 130, width: 5, height: 5 }, targets, 3)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
  it('snaps points', () => {
    expect(snapPoint({ x: 99, y: 1 }, targets, 2).point).toEqual({ x: 100, y: 0 });
  });
});
