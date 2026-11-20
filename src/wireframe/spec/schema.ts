// JSON Schema of the wireframe spec (public/schema/wireframe-spec.schema.json, written by
// `bun run schema`). Generated from the same constants the parser uses and from the component
// registry, so every component kind and prop (types, options, ranges) is in it: editors complete and
// check specs as they are written. The parser stays the authority (it also resolves names and paths).
import { PLATFORM_IDS } from '@/model';
import { getComponents } from '../library/registry';
import type { AnyComponentDef, PropSpec } from '../library/types';
import { MAX_REPEAT } from '../repeat';
import { SCREEN_STATUSES } from '../flows';
import { primaryListProp, primaryTextProp } from './parse';
import { ALIGNS, CONTAINER_KINDS, POSITIONS, RADII, SPEC_SCHEMA_URL, STYLES } from './types';

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/definitions/${name}` });
const layoutSize: Schema = { anyOf: [{ enum: ['fill', 'hug'] }, { type: 'number', exclusiveMinimum: 0 }], description: '"fill", "hug" or a fixed size in px.' };

const COMMON: Record<string, Schema> = {
  id: { type: 'string', description: 'Stable id (dump writes one for every node; build --into updates the node with this id).' },
  name: { type: 'string', description: 'Layer name (default: the component label / container kind).' },
  hidden: { type: 'boolean' },
  locked: { type: 'boolean' },
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  width: { ...layoutSize, description: 'Width in its stack: "fill", "hug" or px (default: the component\'s sizing).' },
  height: { ...layoutSize, description: 'Height in its stack: "fill", "hug" or px (only for components with a resizable height).' },
  position: { enum: [...POSITIONS], description: '"flow" (default), "pinned-bottom" (screen children: bottom bars) or "free" (absolute, x / y).' },
  bleed: { type: 'boolean', description: 'Edge to edge: ignore the stack\'s side padding.' },
  x: { type: 'number', description: 'Free / unstacked nodes: left in the parent.' },
  y: { type: 'number', description: 'Free / unstacked nodes: top in the parent.' },
  rotation: { type: 'number' },
  scale: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
  size: { type: 'object', properties: { width: { type: 'number', minimum: 0 }, height: { type: 'number', minimum: 0 } }, required: ['width', 'height'], additionalProperties: false, description: 'Box of a node no layout places (free, in a free screen).' },
  opens: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Screen(s) this element opens (adds flows).' },
  note: { type: 'string', description: 'A note attached to this node.' },
};

/** Common keys as references (each written once under definitions). */
const COMMON_REFS: Record<string, Schema> = Object.fromEntries(Object.keys(COMMON).map((k) => [k, ref(`common.${k}`)]));

const CONTAINER: Record<string, Schema> = {
  gap: { type: 'number', minimum: 0 },
  padding: { type: 'number', minimum: 0 },
  align: { enum: [...ALIGNS] },
  columns: { type: 'integer', minimum: 1, maximum: 12, description: 'Grids only.' },
  style: { enum: [...STYLES] },
  radius: { enum: [...RADII] },
  repeat: { type: 'integer', minimum: 1, maximum: MAX_REPEAT, description: 'Repeat the first child N times (a list of anything).' },
};

function propSchema(s: PropSpec): Schema {
  const base: Schema = { description: [s.label, s.help].filter(Boolean).join('. ') };
  switch (s.type) {
    case 'number':
      return { ...base, type: 'number', ...(s.min !== undefined ? { minimum: s.min } : {}), ...(s.max !== undefined ? { maximum: s.max } : {}), default: s.default };
    case 'boolean':
      return { ...base, type: 'boolean', default: s.default };
    case 'choice':
      return { ...base, enum: [...s.options], default: s.default };
    case 'list':
      return { ...base, type: 'array', items: { type: 'string' }, ...(s.min !== undefined ? { minItems: s.min } : {}), ...(s.max !== undefined ? { maxItems: s.max } : {}), default: [...s.default] };
    case 'icon':
      return { ...base, type: 'string', description: `${base.description}. An icon name: "heart", "lucide:Heart", "ph:heart" ('' = none).`, default: s.default };
    default:
      return { ...base, type: 'string', default: s.default };
  }
}

function componentNode(def: AnyComponentDef): Schema {
  const props: Schema = {
    type: 'object',
    properties: Object.fromEntries(Object.entries(def.props as Record<string, PropSpec>).map(([k, s]) => [k, propSchema(s)])),
    additionalProperties: false,
  };
  const forms: Schema[] = [props, { type: 'null' }];
  const text = primaryTextProp(def);
  const list = primaryListProp(def);
  if (text) forms.push({ type: 'string', description: `Short form: sets "${text}".` });
  if (list) forms.push({ ...propSchema((def.props as Record<string, PropSpec>)[list]), description: `Short form: sets "${list}".` });
  return {
    type: 'object',
    description: `${def.label} (${def.category}).`,
    properties: { [def.kind]: { anyOf: forms }, ...COMMON_REFS },
    required: [def.kind],
    additionalProperties: false,
  };
}

/** The schema (an object; `JSON.stringify` it with 2 spaces and a newline for the file). */
export function wireframeSpecSchema(): Schema {
  const defs = getComponents().filter((d) => !d.hidden);
  const kinds = defs.map((d) => d.kind);
  const definitions: Record<string, Schema> = {
    Node: {
      description: 'A node: a library component, a container, a shared component instance, a plain group or a raw project object.',
      anyOf: [...kinds.map((k) => ref(`component:${k}`)), ref('ExplicitComponent'), ...CONTAINER_KINDS.map((k) => ref(`container:${k}`)), ref('Use'), ref('Group'), ref('RawNode')],
    },
    ExplicitComponent: {
      type: 'object',
      properties: { kind: { enum: kinds }, props: { type: 'object' }, ...COMMON_REFS },
      required: ['kind'],
      additionalProperties: false,
    },
    Use: { type: 'object', properties: { use: { type: 'string', description: 'A shared component\'s name (or id).' }, ...COMMON_REFS }, required: ['use'], additionalProperties: false },
    Group: { type: 'object', properties: { group: { type: 'array', items: ref('Node') }, ...COMMON_REFS }, required: ['group'], additionalProperties: false },
    RawNode: {
      type: 'object',
      properties: { node: { type: 'object', description: 'A node as stored in a project file (designer-project.schema.json).' }, id: COMMON_REFS.id, opens: COMMON_REFS.opens, note: COMMON_REFS.note },
      required: ['node'],
      additionalProperties: false,
    },
    FrameLayout: {
      anyOf: [
        { const: 'free', description: 'No stack: content placed freely (x / y).' },
        { type: 'object', properties: { kind: { enum: [...CONTAINER_KINDS] }, gap: CONTAINER.gap, padding: CONTAINER.padding, align: CONTAINER.align, columns: CONTAINER.columns }, additionalProperties: false },
      ],
      description: 'Root layout of a frame (default: a vertical stack with the platform\'s padding and gap).',
    },
    Variant: {
      type: 'object',
      properties: {
        platform: { enum: [...PLATFORM_IDS] },
        id: { type: 'string', description: 'The frame\'s node id.' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number', exclusiveMinimum: 0 },
        layout: ref('FrameLayout'),
        root: { type: 'array', items: ref('Node') },
      },
      required: ['platform'],
      additionalProperties: false,
    },
    Screen: {
      type: 'object',
      description: 'A logical screen: one frame (platform, root… on the screen) or several (variants).',
      properties: {
        name: { type: 'string' },
        id: { type: 'string', description: 'The logical screen\'s id.' },
        status: { anyOf: [{ enum: [...SCREEN_STATUSES] }, { type: 'null' }] },
        platform: { enum: [...PLATFORM_IDS], default: 'phone' },
        frameId: { type: 'string', description: 'The frame\'s node id (one-frame form).' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number', exclusiveMinimum: 0 },
        layout: ref('FrameLayout'),
        root: { type: 'array', items: ref('Node') },
        variants: { type: 'array', items: ref('Variant'), minItems: 1 },
      },
      required: ['name'],
      additionalProperties: false,
    },
    SharedComponent: {
      type: 'object',
      properties: { name: { type: 'string' }, id: { type: 'string' }, content: ref('Node') },
      required: ['name', 'content'],
      additionalProperties: false,
    },
    Flow: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        from: { type: 'string', description: 'A node id or a path: "Settings/Language", "Settings@tablet/Language".' },
        to: { type: 'string', description: 'A screen name or id.' },
        label: { type: 'string' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    Note: {
      type: 'object',
      properties: { id: { type: 'string' }, text: { type: 'string' }, on: { type: 'string', description: 'A node id or path (absent: a free note).' }, x: { type: 'number' }, y: { type: 'number' } },
      required: ['text'],
      additionalProperties: false,
    },
  };
  for (const k of CONTAINER_KINDS) {
    definitions[`container:${k}`] = { type: 'object', properties: { [k]: { type: 'array', items: ref('Node') }, ...CONTAINER, ...COMMON_REFS }, required: [k], additionalProperties: false };
  }
  for (const d of defs) definitions[`component:${d.kind}`] = componentNode(d);
  for (const [k, v] of Object.entries(COMMON)) definitions[`common.${k}`] = v;
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: SPEC_SCHEMA_URL,
    title: 'Designer wireframe spec',
    description: 'Screens as a tree of library components, for `designer wf build`. Reference: https://github.com/henriquefps/logo-designer/blob/main/docs/wireframe-spec.md',
    type: 'object',
    properties: {
      $schema: { type: 'string' },
      version: { const: 1 },
      name: { type: 'string', description: 'Project name.' },
      components: { type: 'array', items: ref('SharedComponent') },
      screens: { type: 'array', items: ref('Screen') },
      canvas: { type: 'array', items: ref('Node') },
      flows: { type: 'array', items: ref('Flow') },
      notes: { type: 'array', items: ref('Note') },
    },
    required: ['screens'],
    additionalProperties: false,
    definitions,
  };
}

export const wireframeSpecSchemaText = () => JSON.stringify(wireframeSpecSchema(), null, 2) + '\n';
