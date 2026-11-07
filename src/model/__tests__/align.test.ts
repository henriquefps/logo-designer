import { describe, expect, it } from 'vitest';
import { alignDeltas, createDocument, createRect, distributeDeltas } from '..';

describe('align & distribute', () => {
  const a = createRect({ width: 10, height: 10, transform: { x: 5, y: 5 } });
  const b = createRect({ width: 20, height: 20, transform: { x: 50, y: 100 } });
  const c = createRect({ width: 10, height: 10, transform: { x: 200, y: 5 } });
  const doc = createDocument({ children: [a, b, c] });

  it('aligns left to the selection', () => {
    const d = alignDeltas(doc, [a.id, b.id], 'left');
    expect(d.get(b.id)).toEqual({ x: -40, y: 0 });
    expect(d.has(a.id)).toBe(false);
  });
  it('aligns a single node to the artboard center', () => {
    const d = alignDeltas(doc, [a.id], 'hcenter');
    expect(d.get(a.id)).toEqual({ x: 507, y: 0 });
  });
  it('distributes horizontally with equal gaps', () => {
    const d = distributeDeltas(doc, [a.id, b.id, c.id], 'horizontal');
    // span 0..205, sizes 40, gap (205-40)/2 = 82.5 → b.x should be 92.5 (from 40)
    expect(d.get(b.id)!.x).toBeCloseTo(52.5);
  });
});
