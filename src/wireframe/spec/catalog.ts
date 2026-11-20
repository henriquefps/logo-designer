// The component catalog (`designer wf components`, docs/wireframe-mode.md → Phase 3 → A2): every
// library component with what an agent needs to write a spec, generated from the registry at run
// time so it never goes stale.
import type { LayoutSize } from '@/model';
import { getComponents } from '../library/registry';
import { resizableAxes, type AnyComponentDef, type DefaultPlacement, type PropCondition, type PropSpec } from '../library/types';
import { CONTAINER_PRESETS } from '../containers';
import { defaultLayout } from '../layout';
import { primaryListProp, primaryTextProp } from './parse';

export interface CatalogProp {
  name: string;
  type: PropSpec['type'];
  label: string;
  default: unknown;
  options?: readonly string[];
  min?: number;
  max?: number;
  visibleWhen?: Readonly<Record<string, PropCondition>>;
  help?: string;
}

export interface CatalogEntry {
  kind: string;
  label: string;
  category: string;
  platforms: readonly string[] | 'all';
  keywords: readonly string[];
  props: CatalogProp[];
  /** Which prop `{ "<kind>": "…" }` / `{ "<kind>": [ … ] }` sets. */
  shortForm: { text?: string; list?: string };
  sizing: { width: LayoutSize; height: LayoutSize; bleed: boolean };
  resizable: { width: boolean; height: boolean };
  placement?: DefaultPlacement;
  defaultSize: { width: number; height: number };
  example: Record<string, unknown>;
}

export interface CatalogContainer {
  key: 'vstack' | 'hstack' | 'grid';
  label: string;
  defaults: Record<string, unknown>;
  example: Record<string, unknown>;
}

export interface Catalog {
  components: CatalogEntry[];
  containers: CatalogContainer[];
}

function exampleOf(def: AnyComponentDef): Record<string, unknown> {
  const specs = Object.entries(def.props as Record<string, PropSpec>);
  const props: Record<string, unknown> = {};
  for (const [k, s] of specs) {
    if (Object.keys(props).length >= 4) break;
    if (s.visibleWhen) continue;
    if ((s.type === 'text' || s.type === 'multiline') && s.default) props[k] = s.default;
    else if (s.type === 'list' && s.default.length) props[k] = [...s.default];
    else if (s.type === 'choice') props[k] = s.default;
  }
  return { [def.kind]: props };
}

function propOf(name: string, s: PropSpec): CatalogProp {
  const p: CatalogProp = { name, type: s.type, label: s.label, default: s.type === 'list' ? [...s.default] : s.default };
  if (s.type === 'choice') p.options = s.options;
  if (s.type === 'number' || s.type === 'list') {
    if (s.min !== undefined) p.min = s.min;
    if (s.max !== undefined) p.max = s.max;
  }
  if (s.visibleWhen) p.visibleWhen = s.visibleWhen;
  if (s.help) p.help = s.help;
  return p;
}

/** The catalog: library components (hidden stand-ins left out), by category then label, and the containers. */
export function componentCatalog(): Catalog {
  const components = getComponents()
    .filter((d) => !d.hidden)
    .map((def): CatalogEntry => {
      const entry: CatalogEntry = {
        kind: def.kind,
        label: def.label,
        category: def.category,
        platforms: def.platforms,
        keywords: def.keywords ?? [],
        props: Object.entries(def.props as Record<string, PropSpec>).map(([k, s]) => propOf(k, s)),
        shortForm: {},
        sizing: { width: def.sizing.width, height: def.sizing.height, bleed: !!def.sizing.bleed },
        resizable: resizableAxes(def),
        defaultSize: { ...def.defaultSize },
        example: exampleOf(def),
      };
      const text = primaryTextProp(def);
      const list = primaryListProp(def);
      if (text) entry.shortForm.text = text;
      if (list) entry.shortForm.list = list;
      if (def.placement) entry.placement = def.placement;
      return entry;
    });
  const containers = (['vstack', 'hstack', 'grid'] as const).map((key): CatalogContainer => {
    const d = defaultLayout(key);
    const defaults: Record<string, unknown> = { gap: d.gap, padding: d.padding, align: d.align, ...(key === 'grid' ? { columns: d.columns } : {}) };
    const label = CONTAINER_PRESETS.find((p) => p.id === key)!.label;
    const example = key === 'grid' ? { grid: [{ image: {} }, { image: {} }, { image: {} }], columns: 3 } : key === 'hstack' ? { hstack: [{ button: 'Cancel' }, { button: 'Save' }], gap: 8 } : { vstack: [{ heading: 'Title' }, { text: 'Body' }], gap: 8 };
    return { key, label, defaults, example };
  });
  return { components, containers };
}

const fmt = (v: unknown) => JSON.stringify(v);
const sizeText = (v: LayoutSize) => (typeof v === 'number' ? `${v}px` : v);

function condText(c: Readonly<Record<string, PropCondition>>): string {
  return Object.entries(c)
    .map(([k, v]) => `${k} = ${Array.isArray(v) ? v.map((x) => fmt(x)).join(' | ') : fmt(v)}`)
    .join(' and ');
}

/** The catalog as Markdown, for reading (an agent or a person). */
export function catalogMarkdown(c: Catalog = componentCatalog()): string {
  const out: string[] = [
    '# Wireframe components',
    '',
    'Every library component, for the wireframe spec (docs/wireframe-spec.md). In a spec a component is',
    '`{ "<kind>": { ...props } }`; props left out take their default. Short forms: `{ "<kind>": "text" }` sets the',
    'prop named under "Short form", `{ "<kind>": ["a", "b"] }` its list prop.',
    '',
    '## Containers',
    '',
    'Keys next to the children: `gap`, `padding`, `align` (start, center, end, stretch), `columns` (grid), `style`',
    '(none, outline, filled, outline-filled), `radius` (none, small, large), `repeat` (repeat the first child N times).',
    '',
  ];
  for (const k of c.containers) {
    out.push(`- **${k.key}** (${k.label}): defaults ${Object.entries(k.defaults).map(([a, b]) => `${a} ${fmt(b)}`).join(', ')}. Example: \`${fmt(k.example)}\``);
  }
  out.push('', 'Shared components: `{ "use": "<name>" }`. Plain shapes from a project: `{ "node": { … } }`.', '');
  const categories = [...new Set(c.components.map((e) => e.category))];
  for (const cat of categories) {
    out.push(`## ${cat}`, '');
    for (const e of c.components.filter((x) => x.category === cat)) {
      out.push(`### ${e.label} — \`${e.kind}\``, '');
      const facts = [
        `Platforms: ${e.platforms === 'all' ? 'all' : e.platforms.join(', ')}`,
        `In a stack: width ${sizeText(e.sizing.width)}, height ${sizeText(e.sizing.height)}${e.sizing.bleed ? ', edge to edge (bleed)' : ''}`,
        `Resizable: ${[e.resizable.width && 'width', e.resizable.height && 'height'].filter(Boolean).join(' and ') || 'no'}`,
      ];
      if (e.placement) facts.push(`On a screen it goes: ${e.placement.position === 'pinned-bottom' ? 'pinned to the bottom' : `free, ${e.placement.anchor}`}`);
      if (e.shortForm.text || e.shortForm.list) facts.push(`Short form: ${[e.shortForm.text && `"…" → ${e.shortForm.text}`, e.shortForm.list && `[…] → ${e.shortForm.list}`].filter(Boolean).join(', ')}`);
      if (e.keywords.length) facts.push(`Also: ${e.keywords.join(', ')}`);
      out.push(facts.join(' · '), '');
      out.push('| Prop | Type | Default | Notes |', '| --- | --- | --- | --- |');
      for (const p of e.props) {
        const notes = [
          p.options && `one of ${p.options.join(', ')}`,
          (p.min !== undefined || p.max !== undefined) && `${p.type === 'list' ? 'entries ' : ''}${p.min ?? '…'}–${p.max ?? '…'}`,
          p.visibleWhen && `only when ${condText(p.visibleWhen)}`,
          p.help,
        ]
          .filter(Boolean)
          .join('; ')
          .replace(/\|/g, '\\|');
        out.push(`| \`${p.name}\` | ${p.type} | ${fmt(p.default).replace(/\|/g, '\\|')} | ${notes} |`);
      }
      out.push('', `Example: \`${fmt(e.example)}\``, '');
    }
  }
  return out.join('\n');
}
