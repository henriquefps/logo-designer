#!/usr/bin/env bun
// Generates public/schema/designer-project.schema.json from the TS types (src/io/projectFileTypes.ts →
// src/model/types.ts), and public/schema/wireframe-spec.schema.json from the wireframe spec module and the
// component registry (src/wireframe/spec/schema.ts). Fields the importer fills in when missing are made optional, so a minimal
// hand-written file validates. Run: `bun run schema` (or `bun run schema --check` in CI).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from 'ts-json-schema-generator';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public/schema/designer-project.schema.json');
const URL = 'https://designer.hfps.dev/schema/designer-project.schema.json';

type Schema = { [k: string]: unknown; properties?: Record<string, Schema>; required?: string[]; definitions?: Record<string, Schema> };

/** Optional on input (see validateDocument in src/io/projectFile.ts), per definition. */
const NODE_BASE = ['id', 'name', 'visible', 'locked', 'opacity', 'transform'];
const PAINTED = ['fill', 'stroke'];
const OPTIONAL: Record<string, string[]> = {
  DesignerProjectFile: ['id', 'name', 'createdAt', 'updatedAt'],
  Artboard: ['background'],
  Transform: ['x', 'y', 'rotation', 'scaleX', 'scaleY'],
  Stroke: ['cap', 'join', 'dash'],
  BezierPoint: ['type'],
  SubPath: ['closed'],
  GroupNode: NODE_BASE,
  ImageNode: NODE_BASE,
  PathNode: [...NODE_BASE, ...PAINTED, 'fillRule'],
  RectNode: [...NODE_BASE, ...PAINTED, 'radius'],
  EllipseNode: [...NODE_BASE, ...PAINTED],
  PolygonNode: [...NODE_BASE, ...PAINTED],
  TextNode: [...NODE_BASE, ...PAINTED, 'fontFamily', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'align'],
  // Wireframe documents (docs/project-format.md → Wireframe documents).
  WireframeDocInfo: ['screens'],
  WireframeScreen: ['name'],
  WireframeFlow: ['id'],
  WireframeSymbol: ['name'],
  ScreenFrameInfo: ['screenId', 'platform', 'width', 'height'],
  ComponentInfo: ['props'],
  LayoutInfo: ['gap', 'padding', 'align'],
  NoteInfo: ['text'],
};

export function generateSchema(): string {
  const schema = createGenerator({
    path: resolve(root, 'src/io/projectFileTypes.ts'),
    tsconfig: resolve(root, 'tsconfig.app.json'),
    type: 'DesignerProjectFile',
    expose: 'all',
    topRef: true,
    jsDoc: 'extended',
    additionalProperties: true,
    skipTypeCheck: true,
  }).createSchema('DesignerProjectFile') as Schema;
  const defs = schema.definitions ?? {};
  for (const [name, fields] of Object.entries(OPTIONAL)) {
    const d = defs[name];
    if (!d) throw new Error(`gen-schema: no definition ${name} (types changed? update OPTIONAL)`);
    if (!d.required) continue;
    d.required = d.required.filter((k) => !fields.includes(k));
    if (!d.required.length) delete d.required;
  }
  // Colors are "#rrggbb" / "#rrggbbaa".
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    const o = v as Schema;
    const color = o.properties?.color;
    if (color && color.type === 'string') Object.assign(color, { pattern: '^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$', description: '#rrggbb or #rrggbbaa' });
    Object.values(o).forEach(walk);
  };
  walk(defs);
  const tile = defs.IconDocInfo?.properties?.tile;
  if (tile) Object.assign(tile, { pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'Tile colour, #rrggbb (or #rgb); default #2063b0 (hfps blue). Older hfps repos keep olive #5b7a3a.' });
  const glyph = defs.IconDocInfo?.properties?.glyph;
  if (glyph) Object.assign(glyph, { pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'One-colour mode: the glyph colour, #rrggbb (or #rgb); default #ffffff (white). Ignored when colour is "full-colour".' });
  const colour = defs.IconDocInfo?.properties?.colour;
  if (colour) Object.assign(colour, { description: '"one-colour" (default): every paint becomes the glyph colour. "full-colour": the document\'s own paints (solids, gradients, opacity) are kept.' });
  const out = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: URL,
    title: 'Designer project (.designer.json)',
    description: 'A Designer (https://designer.hfps.dev) project file. Field reference: https://github.com/henriquefps/logo-designer/blob/main/docs/project-format.md',
    $ref: schema.$ref,
    definitions: defs,
  };
  return JSON.stringify(out, null, 2) + '\n';
}

/** The wireframe spec schema (src/wireframe/spec/schema.ts). Needs the component registry, so the glob loader first under Bun. */
export const SPEC_OUT = resolve(root, 'public/schema/wireframe-spec.schema.json');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { installGlobPlugin } = await import('../src/cli/globPlugin.ts');
  installGlobPlugin();
  const { wireframeSpecSchemaText } = await import('../src/wireframe/spec/schema.ts');
  const files: [string, string, string][] = [
    [OUT, generateSchema(), 'public/schema/designer-project.schema.json'],
    [SPEC_OUT, wireframeSpecSchemaText(), 'public/schema/wireframe-spec.schema.json'],
  ];
  if (process.argv.includes('--check')) {
    let stale = false;
    for (const [path, next, name] of files) {
      const cur = await readFile(path, 'utf8').catch(() => '');
      if (cur !== next) {
        console.error(`${name} is out of date: run \`bun run schema\`.`);
        stale = true;
      }
    }
    if (stale) process.exit(1);
    console.log('schemas up to date');
  } else {
    for (const [path, next] of files) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, next);
      console.log(`Wrote ${path}`);
    }
  }
}
