import { describe, expect, it } from 'vitest';
import { createDocument, createEllipse, createGroup, createPath, createPolygon, createRect, createText, linear } from '@/model';
import { parseProject, serializeProject, validateDocument } from './projectFile';

describe('project file', () => {
  it('round-trips every node type', () => {
    const doc = createDocument({
      name: 'Logo',
      children: [
        createRect({ fill: linear('#000000', '#ffffff', 30) }),
        createGroup({ children: [createEllipse(), createPolygon({ innerRadius: 10 })] }),
        createPath({ subpaths: [{ closed: true, points: [{ x: 0, y: 0, type: 'corner', out: { x: 1, y: 1 } }, { x: 5, y: 0, type: 'smooth' }] }] }),
        createText({ text: 'Hi' }),
      ],
    });
    const back = parseProject(serializeProject(doc));
    expect(back.children).toEqual(doc.children);
    expect(back.name).toBe('Logo');
    expect(back.artboard).toEqual(doc.artboard);
  });
  it('rejects other files', () => {
    expect(() => parseProject('{"a":1}')).toThrow(/not a Designer/);
    expect(() => parseProject('nope')).toThrow(/JSON/);
    expect(() => parseProject(JSON.stringify({ ...createDocument(), schemaVersion: 2 }))).toThrow(/newer version/);
  });
  it('rejects damaged nodes with a readable message', () => {
    const doc = createDocument({ children: [createRect()] });
    const bad = JSON.parse(serializeProject(doc));
    bad.children[0].width = 'wide';
    expect(() => validateDocument(bad)).toThrow(/damaged \(rect node\)/);
    bad.children[0] = { type: 'blob', transform: { x: 0, y: 0 } };
    expect(() => validateDocument(bad)).toThrow(/unknown node type/);
  });
  it('renews duplicate ids and fills defaults', () => {
    const r = createRect();
    const doc = JSON.parse(serializeProject(createDocument({ children: [r, r] })));
    delete doc.children[0].opacity;
    const back = validateDocument(doc);
    expect(back.children[0].id).toBe(r.id);
    expect(back.children[1].id).not.toBe(r.id);
    expect(back.children[0].opacity).toBe(1);
  });
});
