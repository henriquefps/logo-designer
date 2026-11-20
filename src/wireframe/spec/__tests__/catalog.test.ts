// A2: the catalog comes from the registry; the JSON Schema is generated, committed, and accepts what
// the parser accepts (the docs example, dumps of real projects).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { getComponents } from '../../library/registry';
import { buildFromSpec, dumpToSpec } from '..';
import { catalogMarkdown, componentCatalog } from '../catalog';
import { wireframeSpecSchemaText } from '../schema';
import { containersProject, settingsProject, sharedProject, variantsProject } from './fixtures';

const FILE = resolve(__dirname, '../../../../public/schema/wireframe-spec.schema.json');
const committed = readFileSync(FILE, 'utf8');
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(committed));
const example = JSON.parse(readFileSync(resolve(__dirname, 'hoard-settings.spec.json'), 'utf8'));

describe('component catalog', () => {
  const cat = componentCatalog();

  it('lists every library component (not the hidden stand-ins) with props, sizing and an example', () => {
    const visible = getComponents().filter((d) => !d.hidden);
    expect(cat.components.map((c) => c.kind).sort()).toEqual(visible.map((d) => d.kind).sort());
    expect(cat.components.find((c) => c.kind === 'placeholder')).toBeUndefined();
    const row = cat.components.find((c) => c.kind === 'list-row')!;
    expect(row).toMatchObject({ label: 'List row', category: 'Lists', platforms: ['phone', 'tablet'], shortForm: { text: 'title' }, sizing: { width: 'fill', height: 'hug', bleed: true }, resizable: { width: true, height: false } });
    expect(row.props.find((p) => p.name === 'trailing')).toEqual({ name: 'trailing', type: 'choice', label: 'Trailing', default: 'chevron', options: ['none', 'chevron', 'toggle', 'value', 'checkbox'] });
    expect(row.props.find((p) => p.name === 'value')!.visibleWhen).toEqual({ trailing: 'value' });
    expect(cat.components.find((c) => c.kind === 'fab')!.placement).toEqual({ position: 'free', anchor: 'bottom-right' });
    expect(cat.containers.map((c) => c.key)).toEqual(['vstack', 'hstack', 'grid']);
  });

  it('every example builds', () => {
    const root = [...cat.components.map((c) => c.example), ...cat.containers.map((c) => c.example)];
    const { doc, warnings } = buildFromSpec({ screens: [{ name: 'All', root }] });
    expect(warnings).toEqual([]);
    expect(doc.children[0].type === 'group' && doc.children[0].children.length).toBe(root.length);
  });

  it('Markdown has a section per component with its props table', () => {
    const md = catalogMarkdown(cat);
    expect(md).toMatch(/^# Wireframe components/);
    expect(md).toContain('### List row — `list-row`');
    expect(md).toContain('| `trailing` | choice | "chevron" | one of none, chevron, toggle, value, checkbox |');
    expect(md).toContain('only when trailing = "value"');
    expect(md).toContain('On a screen it goes: pinned to the bottom');
    for (const c of cat.components) expect(md).toContain(`\`${c.kind}\``);
  });
});

describe('wireframe spec JSON Schema', () => {
  it('is up to date (run `bun run schema`)', () => {
    expect(wireframeSpecSchemaText()).toBe(committed);
  });

  it('accepts the docs example and the dumps of real projects', () => {
    expect(validate(example), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
    for (const make of [settingsProject, containersProject, sharedProject, variantsProject]) {
      const spec = JSON.parse(JSON.stringify(dumpToSpec(make())));
      expect(validate(spec), `${make.name}: ${JSON.stringify(validate.errors?.slice(0, 3))}`).toBe(true);
    }
  });

  it('rejects a bad choice, an unknown prop and a missing screen list', () => {
    expect(validate({ screens: [{ name: 'A', root: [{ 'list-row': { trailing: 'arrow' } }] }] })).toBe(false);
    expect(validate({ screens: [{ name: 'A', root: [{ 'list-row': { titel: 'x' } }] }] })).toBe(false);
    expect(validate({ name: 'x' })).toBe(false);
    expect(validate({ screens: [{ name: 'A', root: [{ 'list-row': 'Language' }, { tabs: ['A', 'B'] }, { vstack: [], repeat: 3 }] }] })).toBe(true);
  });
});
