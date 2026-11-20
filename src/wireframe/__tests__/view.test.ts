import { describe, expect, it } from 'vitest';
import { createDocument, createGroup, type ComponentNode, type ScreenNode } from '@/model';
import { addFlow, canvasArrowOptions, flowLayout } from '../flows';
import { materializeDocument } from '../pipeline';
import { addScreen, contentRect } from '../screens';
import { fitTarget } from '../view';

const comp = (id: string, kind: string, props: Record<string, unknown>): ComponentNode => ({ ...createGroup({ name: `${kind} ${id}` }), id, component: { kind, props } });

describe('fit to view (wireframe)', () => {
  it('holds the arrows routed above or below the screens (found recording the overview)', () => {
    // A back link from the third screen to the first goes around the second: on a lane outside every frame, which
    // Ctrl+0 cut off.
    const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
    const a = addScreen(doc, { platform: 'phone', name: 'A', x: 0, y: 0 });
    addScreen(doc, { platform: 'phone', name: 'B', x: 470, y: 0 });
    const c = addScreen(doc, { platform: 'phone', name: 'C', x: 940, y: 0 });
    (doc.children.find((n) => n.id === c) as ScreenNode).children = [comp('row', 'list-row', { title: 'Voltar' })];
    const d = structuredClone(materializeDocument(doc));
    addFlow(d, 'row', (d.children.find((n) => n.id === a) as ScreenNode).screen.screenId);
    const done = materializeDocument(d);
    const frames = contentRect(done)!;
    const fit = fitTarget(done);
    const pts = flowLayout(done, canvasArrowOptions(0.5)).arrows.flatMap((x) => x.route.points);
    expect(pts.some((p) => p.y < frames.y || p.y > frames.y + frames.height)).toBe(true);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(fit.x);
      expect(p.x).toBeLessThanOrEqual(fit.x + fit.width);
      expect(p.y).toBeGreaterThanOrEqual(fit.y);
      expect(p.y).toBeLessThanOrEqual(fit.y + fit.height);
    }
  });

  it('is the content alone without arrows', () => {
    const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
    addScreen(doc, { platform: 'phone', name: 'A', x: 0, y: 0 });
    const done = materializeDocument(doc);
    expect(fitTarget(done)).toEqual(contentRect(done));
  });
});
