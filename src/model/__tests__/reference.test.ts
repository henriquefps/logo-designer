import { describe, expect, it } from 'vitest';
import { applyReference, createDocument, createImage, createRect, createText, hitTest, hitTestReference, nodesInRect, skippedReferenceNodes, skippedReferenceNotice } from '@/model';
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

describe('reference state rules', () => {
  it('parseProject repairs reference + unlocked to reference + locked', () => {
    const { doc } = make();
    const text = createText({ transform: { x: 5, y: 5 }, reference: true, locked: false });
    const back = parseProject(serializeProject({ ...doc, children: [...doc.children, text] }));
    const t = back.children[2];
    expect(t.reference).toBe(true);
    expect(t.locked).toBe(true);
  });
  it('applyReference keeps reference and locked in step', () => {
    const r = createRect({});
    applyReference(r, true);
    expect([r.reference, r.locked]).toEqual([true, true]);
    applyReference(r, false);
    expect(r.reference).toBeUndefined();
    expect(r.locked).toBe(false);
  });
  it('hitTestReference finds only reference nodes; hitTest still ignores them', () => {
    const { ref, doc } = make();
    expect(hitTestReference(doc, { x: 100, y: 100 })?.id).toBe(ref.id);
    expect(hitTestReference(doc, { x: 500, y: 500 })).toBeNull();
    expect(hitTest(doc, { x: 100, y: 100 })).toBeNull();
  });
  it('counts non-image references that export skips, per scope', () => {
    const { ref, rect, doc } = make();
    const text = createText({ name: 'Tpdb', reference: true, locked: true });
    const d = { ...doc, children: [...doc.children, text] };
    expect(skippedReferenceNodes(doc)).toEqual([]);
    expect(skippedReferenceNodes(d).map((n) => n.id)).toEqual([text.id]);
    expect(skippedReferenceNodes(d, [rect.id, ref.id])).toEqual([]);
    expect(skippedReferenceNodes(d, [text.id])).toHaveLength(1);
    expect(skippedReferenceNotice(skippedReferenceNodes(d))).toContain('1 reference object is not exported');
  });
});
