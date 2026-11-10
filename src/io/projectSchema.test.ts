// The published JSON Schema (public/schema/designer-project.schema.json) is generated from the TS
// types and must stay in sync; real project files and minimal hand-written ones validate against it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { createDocument, createEllipse, createGroup, createImage, createPath, createPolygon, createRect, createText, linear, radial } from '@/model';
import { generateSchema } from '../../scripts/gen-schema';
import { serializeProject, validateDocument } from './projectFile';

const FILE = resolve(__dirname, '../../public/schema/designer-project.schema.json');
const committed = readFileSync(FILE, 'utf8');
const validate = new Ajv({ allErrors: true }).compile(JSON.parse(committed));

describe('project JSON Schema', () => {
  it('is up to date with the types (run `bun run schema`)', () => {
    expect(generateSchema()).toBe(committed);
  }, 30_000);

  it('accepts saved projects with every node type', () => {
    const doc = createDocument({
      children: [
        createRect({ fill: linear('#000000', '#ffffff', 45) }),
        createGroup({ children: [createEllipse({ fill: radial('#ff0000', '#00000000') }), createPolygon({ innerRadius: 10 })] }),
        createPath({ subpaths: [{ closed: true, points: [{ x: 0, y: 0, type: 'corner', out: { x: 4, y: 0 } }, { x: 10, y: 10, type: 'smooth', in: { x: 10, y: 4 } }] }] }),
        createText({ text: 'Hi' }),
        createImage({ href: 'data:image/png;base64,AAAA' }),
      ],
    });
    const data = { ...JSON.parse(serializeProject(doc)), icon: { preset: 'app-icon', shape: 'auto' } };
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts the minimal file the importer accepts, rejects bad colors', () => {
    const minimal = { schemaVersion: 1, artboard: { width: 128, height: 128 }, children: [{ type: 'ellipse', rx: 10, ry: 10, transform: { x: 64, y: 64 }, fill: { kind: 'solid', color: '#ff0000' } }] };
    expect(validate(minimal), JSON.stringify(validate.errors)).toBe(true);
    expect(() => validateDocument(minimal)).not.toThrow();
    minimal.children[0].fill.color = 'red';
    expect(validate(minimal)).toBe(false);
  });
});
