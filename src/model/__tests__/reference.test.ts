import { describe, expect, it } from 'vitest';
import { createDocument, createImage, createRect, hitTest, nodesInRect } from '@/model';
import { exportSvg } from '@/io/svgExport';
import { parseProject, serializeProject } from '@/io/projectFile';

const make = () => {
  const ref = createImage({ href: 'data:image/png;base64,AAAA', width: 200, height: 200, transform: { x: 100, y: 100 }, reference: true, locked: true });
  const rect = createRect({ width: 20, height: 20, transform: { x: 500, y: 500 } });
  return { ref, rect, doc: createDocument({ artboard: { width: 1000, height: 1000, background: { kind: 'none' } }, children: [ref, rect] }) };
};

describe('reference nodes', () => {
  it('are skipped by hitTest and nodesInRect, even when unlocked', () => {
    const { ref, doc } = make();
    const unlocked = { ...doc, children: [{ ...ref, locked: false }, ...doc.children.slice(1)] };
    expect(hitTest(unlocked, { x: 100, y: 100 })).toBeNull();
    expect(nodesInRect(unlocked, { x: 0, y: 0, width: 300, height: 300 })).toEqual([]);
    expect(hitTest(doc, { x: 500, y: 500 })).not.toBeNull();
  });
  it('are skipped by SVG export (artboard and selection scope)', async () => {
    const { ref, rect, doc } = make();
    expect((await exportSvg(doc)).svg).not.toContain('<image');
    expect((await exportSvg(doc)).svg).toContain('<rect');
    const sel = await exportSvg(doc, { scope: 'selection', selection: [ref.id, rect.id] });
    expect(sel.svg).not.toContain('<image');
  });
  it('keep the flag in a project file round-trip', () => {
    const { doc } = make();
    const back = parseProject(serializeProject(doc));
    expect(back.children[0].reference).toBe(true);
    expect(back.children[1].reference).toBeUndefined();
  });
});
