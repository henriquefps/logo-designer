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
    expect(() => validateDocument(bad)).toThrow('damaged at children[0].width: expected a number, got "wide"');
    bad.children[0] = { type: 'blob', transform: { x: 0, y: 0 } };
    expect(() => validateDocument(bad)).toThrow(/children\[0\]\.type: unknown node type "blob"/);
  });
  it('names the JSON path of nested errors', () => {
    const doc = JSON.parse(serializeProject(createDocument({ children: [createGroup({ children: [createRect(), createRect({ fill: linear('#000000', '#ffffff') })] })] })));
    doc.children[0].children[1].fill.stops[1].color = 'red';
    expect(() => validateDocument(doc)).toThrow('children[0].children[1].fill.stops[1].color: expected a color "#rrggbb" or "#rrggbbaa", got "red"');
    const p = JSON.parse(serializeProject(createDocument({ children: [createPath({ subpaths: [{ closed: false, points: [{ x: 0, y: 0, type: 'corner' }] }] })] })));
    p.children[0].subpaths[0].points[0].out = { x: 1 };
    expect(() => validateDocument(p)).toThrow('children[0].subpaths[0].points[0].out.y: expected a number, got nothing');
    p.children[0].subpaths[0].points[0] = { x: 0, y: 0, type: 'cusp' };
    expect(() => validateDocument(p)).toThrow(/points\[0\]\.type: expected one of "corner", "smooth", "symmetric", got "cusp"/);
    const a = JSON.parse(serializeProject(createDocument()));
    a.artboard.width = 0;
    expect(() => validateDocument(a)).toThrow('artboard.width: must be greater than 0');
  });
  it('accepts minimal hand-written files (defaults for optional fields)', () => {
    const doc = validateDocument({
      schemaVersion: 1,
      artboard: { width: 128, height: 128 },
      children: [{ type: 'ellipse', rx: 10, ry: 10, transform: { x: 64, y: 64 }, fill: { kind: 'solid', color: '#FF0000' } }, { type: 'rect', width: 4, height: 4 }],
    });
    expect(doc.artboard.background).toEqual({ kind: 'none' });
    expect(doc.children[0]).toMatchObject({ type: 'ellipse', opacity: 1, visible: true, fill: { kind: 'solid', color: '#ff0000' }, stroke: { paint: { kind: 'none' } } });
    expect(doc.children[1].transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  });
  it('writes $schema into saved files', () => {
    expect(JSON.parse(serializeProject(createDocument())).$schema).toBe('https://designer.hfps.dev/schema/designer-project.schema.json');
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
