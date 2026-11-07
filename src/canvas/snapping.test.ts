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

describe('snap to grid', () => {
  it('snaps the nearest edge to the grid when no smart guide applies', async () => {
    const { useEditorStore } = await import('@/store/useEditorStore');
    useEditorStore.setState({ snapping: false, snapToGrid: true, gridSize: 10 });
    try {
      const r = snapRect({ x: 13, y: 26, width: 20, height: 5 }, [], 3);
      expect(r.dx).toBeCloseTo(-3);
      // Top 26 → 30 is +4, bottom 31 → 30 is -1: the nearer edge wins.
      expect(r.dy).toBeCloseTo(-1);
      expect(snapPoint({ x: 17, y: 2 }, [], 3).point).toEqual({ x: 20, y: 0 });
    } finally {
      useEditorStore.setState({ snapping: true, snapToGrid: false, gridSize: 16 });
    }
  });
});
