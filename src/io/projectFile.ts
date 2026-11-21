import { BRAND, GLYPH_DEFAULT, normalizeTile } from '@/icon/rules';
import {
  newId,
  platformDef,
  PLATFORM_IDS,
  type Artboard,
  type ComponentInfo,
  type DesignDocument,
  type IconDocInfo,
  type LayoutInfo,
  type LayoutItemInfo,
  type LayoutSize,
  type RepeatCopyInfo,
  type NodeBase,
  type Paint,
  type SceneNode,
  type NoteInfo,
  type ScreenFrameInfo,
  type Stroke,
  type SubPath,
  type ScreenStatus,
  type WireframeDocInfo,
  type WireframeFlow,
  type WireframeScreen,
  type WireframeSymbol,
  type GroupNode,
} from '@/model';
import { getComponent } from '@/wireframe/library/registry';
import { validateProps } from '@/wireframe/library/types';
import { MAX_REPEAT } from '@/wireframe/repeat';
import { downloadBlob, safeFileName } from './download';

export const PROJECT_EXTENSION = '.designer.json';
export const PROJECT_FORMAT = 'designer';

/** Public JSON Schema of `.designer.json` (generated from `src/model/types.ts`, see docs/project-format.md). */
export const PROJECT_SCHEMA_URL = 'https://designer.hfps.dev/schema/designer-project.schema.json';

export function serializeProject(doc: DesignDocument): string {
  return JSON.stringify({ $schema: PROJECT_SCHEMA_URL, format: PROJECT_FORMAT, ...doc }, null, 2) + '\n';
}

// ---------- validation ----------
// Every check names the JSON path that is wrong (`children[2].fill.stops[0].color`) so a person or
// an agent writing the file by hand can fix it. Optional fields get their defaults.

class Invalid extends Error {}
const fail = (path: string, problem: string): never => {
  throw new Invalid(`${path || '(root)'}: ${problem}`);
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const show = (v: unknown) => {
  if (v === undefined) return 'nothing';
  const s = JSON.stringify(v);
  return s && s.length > 40 ? s.slice(0, 37) + '…' : String(s);
};
const at = (path: string, key: string | number) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);
const finite = (v: unknown, path: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(path, `expected a number, got ${show(v)}`);
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path, `expected a string, got ${show(v)}`));
const obj = (v: unknown, path: string): Obj => (isObj(v) ? v : fail(path, `expected an object, got ${show(v)}`));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, `expected an array, got ${show(v)}`));
/** Optional enum: missing → fallback; present but wrong → error listing the options. */
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T, path: string): T => {
  if (v === undefined) return fallback;
  return options.includes(v as T) ? (v as T) : fail(path, `expected one of ${options.map((o) => `"${o}"`).join(', ')}, got ${show(v)}`);
};
const color = (v: unknown, path: string) =>
  typeof v === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v.toLowerCase() : fail(path, `expected a color "#rrggbb" or "#rrggbbaa", got ${show(v)}`);

const PAINT_KINDS = ['none', 'solid', 'linear', 'radial'] as const;

function paint(v: unknown, path: string): Paint {
  const p = obj(v, path);
  switch (p.kind) {
    case 'none':
      return { kind: 'none' };
    case 'solid':
      return { kind: 'solid', color: color(p.color, at(path, 'color')) };
    case 'linear':
    case 'radial': {
      const list = arr(p.stops, at(path, 'stops'));
      if (!list.length) fail(at(path, 'stops'), 'a gradient needs at least one stop');
      const stops = list.map((s, i) => {
        const sp = at(at(path, 'stops'), i);
        const so = obj(s, sp);
        return { offset: Math.max(0, Math.min(1, finite(so.offset, at(sp, 'offset')))), color: color(so.color, at(sp, 'color')) };
      });
      if (p.kind === 'radial') return { kind: 'radial', stops };
      return { kind: 'linear', stops, angle: p.angle === undefined ? 0 : finite(p.angle, at(path, 'angle')) };
    }
    default:
      return fail(at(path, 'kind'), `expected one of ${PAINT_KINDS.map((k) => `"${k}"`).join(', ')}, got ${show(p.kind)}`);
  }
}

function stroke(v: unknown, path: string): Stroke {
  const s = obj(v, path);
  const dash = s.dash === undefined ? [] : arr(s.dash, at(path, 'dash'));
  return {
    paint: paint(s.paint, at(path, 'paint')),
    width: Math.max(0, finite(s.width, at(path, 'width'))),
    cap: oneOf(s.cap, ['butt', 'round', 'square'] as const, 'butt', at(path, 'cap')),
    join: oneOf(s.join, ['miter', 'round', 'bevel'] as const, 'miter', at(path, 'join')),
    dash: dash.map((d, i) => Math.max(0, finite(d, at(at(path, 'dash'), i)))),
  };
}

const vec = (v: unknown, path: string) => {
  const o = obj(v, path);
  return { x: finite(o.x, at(path, 'x')), y: finite(o.y, at(path, 'y')) };
};

function subpaths(v: unknown, path: string): SubPath[] {
  return arr(v, path).map((raw, i) => {
    const sp = at(path, i);
    const o = obj(raw, sp);
    const pp = at(sp, 'points');
    return {
      closed: o.closed === true,
      points: arr(o.points, pp).map((rp, j) => {
        const ptPath = at(pp, j);
        const p = obj(rp, ptPath);
        const out: SubPath['points'][number] = {
          x: finite(p.x, at(ptPath, 'x')),
          y: finite(p.y, at(ptPath, 'y')),
          type: oneOf(p.type, ['corner', 'smooth', 'symmetric'] as const, 'corner', at(ptPath, 'type')),
        };
        if (p.in !== undefined) out.in = vec(p.in, at(ptPath, 'in'));
        if (p.out !== undefined) out.out = vec(p.out, at(ptPath, 'out'));
        return out;
      }),
    };
  });
}

export const NODE_TYPES = ['group', 'path', 'rect', 'ellipse', 'polygon', 'text', 'image'] as const;

// ---------- wireframe fields (docs/project-format.md → Wireframe documents) ----------

interface NodeCtx {
  ids: Set<string>;
  /** The document is a wireframe: `screen` / `component` / `layout` / `layoutItem` are kept. */
  wireframe: boolean;
  warnings: string[];
  /** Ids of the document's shared components (`wireframe.symbols`): an instance of another one loads as a plain group. */
  symbols?: ReadonlySet<string>;
}

const nonNegative = (v: unknown, fallback: number, path: string) => (v === undefined ? fallback : Math.max(0, finite(v, path)));
const positive = (v: unknown, fallback: number, path: string) => {
  if (v === undefined) return fallback;
  const n = finite(v, path);
  return n > 0 ? n : fail(path, `must be greater than 0, got ${show(v)}`);
};

function screenInfo(v: unknown, path: string): ScreenFrameInfo {
  const o = obj(v, path);
  const platform = oneOf(o.platform, PLATFORM_IDS, 'phone', at(path, 'platform'));
  const def = platformDef(platform);
  const screenId = o.screenId === undefined ? newId('s') : str(o.screenId, at(path, 'screenId')) || newId('s');
  return {
    screenId,
    platform,
    width: positive(o.width, def.width, at(path, 'width')),
    height: Math.max(def.minHeight, nonNegative(o.height, def.minHeight, at(path, 'height'))),
  };
}

function componentInfo(v: unknown, path: string): ComponentInfo {
  const o = obj(v, path);
  const kind = str(o.kind, at(path, 'kind'));
  if (!kind) fail(at(path, 'kind'), 'must not be empty');
  const props = o.props === undefined ? {} : obj(o.props, at(path, 'props'));
  const out: ComponentInfo = { kind, props: structuredClone(props) };
  if (o.size !== undefined) {
    const sp = at(path, 'size');
    const size = obj(o.size, sp);
    out.size = { width: positive(size.width, 1, at(sp, 'width')), height: nonNegative(size.height, 0, at(sp, 'height')) };
  }
  // Generated (the pipeline works it out again); kept when well formed so a saved file reads back as it was.
  if (o.resolved !== undefined && o.resolved !== null && typeof o.resolved === 'object' && !Array.isArray(o.resolved)) {
    const r = Object.fromEntries(Object.entries(o.resolved as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number>;
    if (Object.keys(r).length) out.resolved = r;
  }
  return out;
}

function noteInfo(v: unknown, path: string): NoteInfo {
  const o = obj(v, path);
  const out: NoteInfo = { text: o.text === undefined ? '' : str(o.text, at(path, 'text')) };
  if (o.target !== undefined && o.target !== null) {
    const target = str(o.target, at(path, 'target'));
    if (!target) fail(at(path, 'target'), 'must not be empty (omit it for a free note)');
    out.target = target;
  }
  return out;
}

const LAYOUT_KINDS = ['vstack', 'hstack', 'grid'] as const;
const LAYOUT_ALIGN = ['start', 'center', 'end', 'stretch'] as const;

function layoutInfo(v: unknown, path: string): LayoutInfo {
  const o = obj(v, path);
  const kp = at(path, 'kind');
  if (o.kind === undefined) fail(kp, `expected one of ${LAYOUT_KINDS.map((k) => `"${k}"`).join(', ')}, got nothing`);
  const kind = oneOf(o.kind, LAYOUT_KINDS, 'vstack', kp);
  const out: LayoutInfo = {
    kind,
    gap: nonNegative(o.gap, 0, at(path, 'gap')),
    padding: nonNegative(o.padding, 0, at(path, 'padding')),
    align: oneOf(o.align, LAYOUT_ALIGN, 'stretch', at(path, 'align')),
  };
  if (kind === 'grid' || o.columns !== undefined) {
    const c = o.columns === undefined ? 2 : finite(o.columns, at(path, 'columns'));
    if (!Number.isInteger(c) || c < 1) fail(at(path, 'columns'), `expected a whole number ≥ 1, got ${show(o.columns)}`);
    out.columns = c;
  }
  if (o.size !== undefined && o.size !== null) {
    const so = obj(o.size, at(path, 'size'));
    out.size = { width: nonNegative(so.width, 0, at(at(path, 'size'), 'width')), height: nonNegative(so.height, 0, at(at(path, 'size'), 'height')) };
  }
  // Container appearance and repeat (docs/wireframe-mode.md → R3, R4).
  if (o.style !== undefined && o.style !== null) {
    const style = oneOf(o.style, CONTAINER_STYLES, 'none', at(path, 'style'));
    if (style !== 'none') out.style = style;
  }
  if (o.radius !== undefined && o.radius !== null) {
    const radius = oneOf(o.radius, CONTAINER_RADII, 'none', at(path, 'radius'));
    if (radius !== 'none') out.radius = radius;
  }
  if (o.repeat !== undefined && o.repeat !== null) {
    const rp = at(path, 'repeat');
    const r = obj(o.repeat, rp);
    const c = finite(r.count, at(rp, 'count'));
    if (!Number.isInteger(c) || c < 1 || c > MAX_REPEAT) fail(at(rp, 'count'), `expected a whole number from 1 to ${MAX_REPEAT}, got ${show(r.count)}`);
    out.repeat = { count: c };
  }
  // Shared components: "Content per instance" (docs/wireframe-mode.md → Shared components → Slots).
  if (o.slot !== undefined && o.slot !== null) {
    if (typeof o.slot !== 'boolean') fail(at(path, 'slot'), `expected true or false, got ${show(o.slot)}`);
    if (o.slot) out.slot = true;
  }
  return out;
}

const CONTAINER_STYLES = ['none', 'outline', 'filled', 'outline-filled'] as const;
const CONTAINER_RADII = ['none', 'small', 'large'] as const;

function repeatCopyInfo(v: unknown, path: string): RepeatCopyInfo {
  const o = obj(v, path);
  const template = str(o.template, at(path, 'template'));
  if (!template) fail(at(path, 'template'), 'must not be empty');
  const index = finite(o.index, at(path, 'index'));
  if (!Number.isInteger(index) || index < 2) fail(at(path, 'index'), `expected a whole number ≥ 2, got ${show(o.index)}`);
  return { template, index };
}

function layoutSize(v: unknown, path: string): LayoutSize {
  if (v === 'fill' || v === 'hug') return v;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return fail(path, `expected "fill", "hug" or a number ≥ 0, got ${show(v)}`);
}

function layoutItemInfo(v: unknown, path: string): LayoutItemInfo {
  const o = obj(v, path);
  const out: LayoutItemInfo = {};
  if (o.width !== undefined) out.width = layoutSize(o.width, at(path, 'width'));
  if (o.height !== undefined) out.height = layoutSize(o.height, at(path, 'height'));
  if (o.position !== undefined) out.position = oneOf(o.position, ['flow', 'pinned-bottom', 'free'] as const, 'flow', at(path, 'position'));
  if (o.bleed !== undefined) {
    if (typeof o.bleed !== 'boolean') fail(at(path, 'bleed'), `expected true or false, got ${show(o.bleed)}`);
    out.bleed = o.bleed as boolean;
  }
  return out;
}

const WIREFRAME_FIELDS = ['screen', 'component', 'layout', 'layoutItem', 'note', 'repeatCopy', 'symbol'] as const;

/** The optional wireframe fields of a node (only on wireframe documents; elsewhere dropped with a warning). */
function wireframeFields(o: Obj, type: string, depth: number, path: string, ctx: NodeCtx): Partial<Pick<NodeBase, (typeof WIREFRAME_FIELDS)[number]>> {
  const present = WIREFRAME_FIELDS.filter((f) => o[f] !== undefined && o[f] !== null);
  if (!present.length) return {};
  if (!ctx.wireframe) {
    ctx.warnings.push(`${at(path, present[0])}: ignored, only wireframe documents (a top-level "wireframe" field) use ${present.join(', ')}`);
    return {};
  }
  const out: Partial<Pick<NodeBase, (typeof WIREFRAME_FIELDS)[number]>> = {};
  if (o.screen !== undefined && o.screen !== null) {
    if (type !== 'group') fail(at(path, 'screen'), `only a group can be a screen frame (this is a ${type})`);
    if (depth > 0) fail(at(path, 'screen'), 'screen frames must be top-level objects (in the document\'s "children")');
    out.screen = screenInfo(o.screen, at(path, 'screen'));
  }
  if (o.component !== undefined && o.component !== null) {
    if (type !== 'group') fail(at(path, 'component'), `only a group can be a component instance (this is a ${type})`);
    if (out.screen) fail(at(path, 'component'), 'a screen frame cannot also be a component');
    const c = componentInfo(o.component, at(path, 'component'));
    const def = getComponent(c.kind);
    if (def) {
      // Bad prop values fall back to the default (numbers are clamped), with a warning; never a failure.
      const { props, problems } = validateProps(def, c.props);
      for (const p of problems) ctx.warnings.push(`${at(at(at(path, 'component'), 'props'), p.key)}: ${p.message}`);
      out.component = problems.length ? { ...c, props } : c;
    } else ctx.warnings.push(`${at(at(path, 'component'), 'kind')}: unknown component "${c.kind}" (made with a newer version?); loaded as a plain group`);
  }
  if (o.layout !== undefined && o.layout !== null) {
    if (type !== 'group') fail(at(path, 'layout'), `only a group can lay out children (this is a ${type})`);
    out.layout = layoutInfo(o.layout, at(path, 'layout'));
  }
  if (o.note !== undefined && o.note !== null) {
    const np = at(path, 'note');
    if (type !== 'group') fail(np, `only a group can be a note (this is a ${type})`);
    if (depth > 0) fail(np, 'notes must be top-level objects (in the document\'s "children")');
    if (out.screen || out.component) fail(np, 'a note cannot also be a screen frame or a component');
    out.note = noteInfo(o.note, np);
  }
  if (o.layoutItem !== undefined && o.layoutItem !== null) out.layoutItem = layoutItemInfo(o.layoutItem, at(path, 'layoutItem'));
  if (o.repeatCopy !== undefined && o.repeatCopy !== null) {
    const info = repeatCopyInfo(o.repeatCopy, at(path, 'repeatCopy'));
    // Copies only live in the container that repeats them; the pipeline drops strays (it regenerates copies anyway).
    if (depth === 0) ctx.warnings.push(`${at(path, 'repeatCopy')}: ignored, a repeat copy must be inside the container that repeats it`);
    else out.repeatCopy = info;
  }
  if (o.symbol !== undefined && o.symbol !== null) {
    // Shared component instance (docs/wireframe-mode.md → Shared components). Never a failure: a reference
    // that cannot be honoured loads the content as a plain group.
    const sp = at(path, 'symbol');
    const ref = obj(o.symbol, sp);
    const id = typeof ref.id === 'string' ? ref.id : '';
    if (type !== 'group') ctx.warnings.push(`${sp}: ignored, only a group can be a shared component instance (this is a ${type})`);
    else if (out.screen || out.component || out.note) ctx.warnings.push(`${sp}: ignored, a screen frame, component or note cannot also be a shared component`);
    else if (!id || !ctx.symbols?.has(id)) ctx.warnings.push(`${at(sp, 'id')}: unknown shared component ${show(ref.id)}; loaded as a plain group`);
    else {
      out.symbol = { id };
      const text = symbolText(ref.text, at(sp, 'text'), ctx.warnings);
      if (text) out.symbol.text = text;
    }
  }
  return out;
}

/** An instance's text overrides (`symbol.text`: node id → prop → string). Bad entries are dropped with a warning. */
function symbolText(v: unknown, path: string, warnings: string[]): Record<string, Record<string, string>> | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) {
    warnings.push(`${path}: ignored, expected { "<node id>": { "<prop>": "text" } }`);
    return undefined;
  }
  const out: Record<string, Record<string, string>> = {};
  for (const [id, props] of Object.entries(v as Record<string, unknown>)) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      warnings.push(`${at(path, id)}: ignored, expected { "<prop>": "text" }`);
      continue;
    }
    const kept: Record<string, string> = {};
    for (const [k, t] of Object.entries(props as Record<string, unknown>)) {
      if (typeof t === 'string') kept[k] = t;
      else warnings.push(`${at(at(path, id), k)}: ignored, expected a string`);
    }
    if (Object.keys(kept).length) out[id] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Shared components (`wireframe.symbols`): masters with their content, validated like nodes in their own id space. */
function symbolsInfo(v: unknown, warnings: string[]): WireframeSymbol[] {
  if (v === undefined || v === null) return [];
  const path = 'wireframe.symbols';
  const list = arr(v, path);
  const ids = new Set<string>();
  const raw = list.map((r, i) => {
    const p = at(path, i);
    const o = obj(r, p);
    const id = str(o.id, at(p, 'id'));
    if (!id) fail(at(p, 'id'), 'must not be empty');
    if (ids.has(id)) fail(at(p, 'id'), `duplicate shared component id "${id}"`);
    ids.add(id);
    return { o, p, id };
  });
  return raw.map(({ o, p, id }) => {
    const name = o.name === undefined ? 'Component' : str(o.name, at(p, 'name')).trim() || 'Component';
    const ctx: NodeCtx = { ids: new Set<string>(), wireframe: true, warnings, symbols: ids };
    const content = node(o.content, ctx, 1, at(p, 'content'));
    if (content.type !== 'group') fail(at(at(p, 'content'), 'type'), `the content of a shared component must be a group (this is a ${content.type})`);
    // A master never points at itself.
    const clean = (n: SceneNode): SceneNode => {
      if (n.type !== 'group') return n;
      if (n.symbol?.id === id) {
        warnings.push(`${at(p, 'content')}: a nested instance of "${name}" inside itself was loaded as a plain group`);
        const copy = { ...n, children: n.children.map(clean) };
        delete copy.symbol;
        return copy;
      }
      return { ...n, children: n.children.map(clean) };
    };
    const group = clean(content) as GroupNode;
    delete group.symbol;
    return { id, name, content: { ...group, id, name } };
  });
}

const SCREEN_STATUS_VALUES = ['current', 'changed', 'new'] as const;

/** Optional wireframe marker (`wireframe`): logical screens (with an optional status) and flows. */
function wireframeInfo(v: unknown, path: string, warnings: string[]): { wireframe?: WireframeDocInfo } {
  if (v === undefined || v === null) return {};
  const o = obj(v, path);
  const sp = at(path, 'screens');
  const seen = new Set<string>();
  const screens = (o.screens === undefined ? [] : arr(o.screens, sp)).map((raw, i) => {
    const p = at(sp, i);
    const s = obj(raw, p);
    const id = str(s.id, at(p, 'id'));
    if (!id) fail(at(p, 'id'), 'must not be empty');
    if (seen.has(id)) fail(at(p, 'id'), `duplicate logical screen id "${id}"`);
    seen.add(id);
    const out: WireframeScreen = { id, name: s.name === undefined ? 'Screen' : str(s.name, at(p, 'name')) };
    if (s.status !== undefined && s.status !== null) {
      if ((SCREEN_STATUS_VALUES as readonly unknown[]).includes(s.status)) out.status = s.status as ScreenStatus;
      else warnings.push(`${at(p, 'status')}: ignored, expected one of ${SCREEN_STATUS_VALUES.map((x) => `"${x}"`).join(', ')}, got ${show(s.status)}`);
    }
    return out;
  });
  const info: WireframeDocInfo = { screens };
  if (o.kit !== undefined && o.kit !== null) {
    if (typeof o.kit === 'boolean') {
      if (o.kit) info.kit = true;
    } else warnings.push(`${at(path, 'kit')}: ignored, expected true or false, got ${show(o.kit)}`);
  }
  if (o.flows !== undefined && o.flows !== null) {
    const fp = at(path, 'flows');
    const flowIds = new Set<string>();
    const flows = arr(o.flows, fp).map((raw, i) => {
      const p = at(fp, i);
      const f = obj(raw, p);
      let id = typeof f.id === 'string' && f.id ? f.id : newId('f');
      if (flowIds.has(id)) id = newId('f');
      flowIds.add(id);
      const from = str(f.from, at(p, 'from'));
      const to = str(f.to, at(p, 'to'));
      const flow: WireframeFlow = { id, from, to };
      if (f.label !== undefined && f.label !== null && str(f.label, at(p, 'label')).trim()) flow.label = (f.label as string).trim();
      if (f.part !== undefined && f.part !== null) {
        const part = str(f.part, at(p, 'part')).trim();
        if (part) flow.part = part;
      }
      if (f.symbol !== undefined && f.symbol !== null) {
        const symbol = str(f.symbol, at(p, 'symbol')).trim();
        if (symbol) flow.symbol = symbol;
      }
      return flow;
    });
    if (flows.length) info.flows = flows;
  }
  return { wireframe: info };
}

/**
 * Drops flows whose source node or target logical screen is not in the file (with a warning each). A shared flow's
 * source (`symbol`) is a node of that master's content.
 */
function checkFlows(wf: WireframeDocInfo, ids: ReadonlySet<string>, warnings: string[]): void {
  if (!wf.flows) return;
  const screens = new Set(wf.screens.map((s) => s.id));
  const masters = new Map<string, Set<string>>();
  for (const m of wf.symbols ?? []) {
    const inside = new Set<string>();
    const visit = (n: SceneNode) => {
      inside.add(n.id);
      if (n.type === 'group') n.children.forEach(visit);
    };
    m.content.children.forEach(visit);
    masters.set(m.id, inside);
  }
  const keep = wf.flows.filter((f, i) => {
    const p = `wireframe.flows[${i}]`;
    if (f.symbol !== undefined && !masters.has(f.symbol)) warnings.push(`${p}.symbol: ignored flow, no shared component "${f.symbol}"`);
    else if (f.symbol !== undefined && !masters.get(f.symbol)!.has(f.from)) warnings.push(`${p}.from: ignored flow, no node "${f.from}" in shared component "${f.symbol}"`);
    else if (f.symbol === undefined && !ids.has(f.from)) warnings.push(`${p}.from: ignored flow, no node "${f.from}"`);
    else if (!screens.has(f.to)) warnings.push(`${p}.to: ignored flow, no logical screen "${f.to}"`);
    else return true;
    return false;
  });
  if (keep.length) wf.flows = keep;
  else delete wf.flows;
}

function node(v: unknown, ctx: NodeCtx, depth: number, path: string): SceneNode {
  const ids = ctx.ids;
  if (depth > 64) fail(path, 'groups are nested too deep (max 64)');
  const o = obj(v, path);
  const type = str(o.type, at(path, 'type'));
  if (!(NODE_TYPES as readonly string[]).includes(type)) {
    fail(at(path, 'type'), `unknown node type "${type}" (expected one of ${NODE_TYPES.join(', ')})`);
  }
  const k = (key: string) => at(path, key);
  let id = typeof o.id === 'string' && o.id ? o.id : newId();
  if (ids.has(id)) id = newId();
  ids.add(id);
  const tp = k('transform');
  const t = o.transform === undefined ? {} : obj(o.transform, tp);
  const base = {
    id,
    name: typeof o.name === 'string' ? o.name : type,
    visible: o.visible !== false,
    // A reference is always locked (older versions could save reference + unlocked): see model/reference.ts.
    locked: o.locked === true || o.reference === true,
    ...(o.reference === true ? { reference: true } : {}),
    opacity: o.opacity === undefined ? 1 : Math.max(0, Math.min(1, finite(o.opacity, k('opacity')))),
    ...(typeof o.blendMode === 'string' ? { blendMode: o.blendMode } : {}),
    ...wireframeFields(o, type, depth, path, ctx),
    transform: {
      x: finite(t.x ?? 0, at(tp, 'x')),
      y: finite(t.y ?? 0, at(tp, 'y')),
      rotation: finite(t.rotation ?? 0, at(tp, 'rotation')),
      scaleX: finite(t.scaleX ?? 1, at(tp, 'scaleX')),
      scaleY: finite(t.scaleY ?? 1, at(tp, 'scaleY')),
    },
  };
  const painted = () => ({
    fill: o.fill === undefined ? ({ kind: 'none' } as Paint) : paint(o.fill, k('fill')),
    stroke: o.stroke === undefined ? NO_STROKE() : stroke(o.stroke, k('stroke')),
  });
  switch (type) {
    case 'group':
      return { ...base, type, children: arr(o.children, k('children')).map((c, i) => node(c, ctx, depth + 1, at(k('children'), i))) };
    case 'path':
      return { ...base, type, ...painted(), subpaths: subpaths(o.subpaths, k('subpaths')), fillRule: oneOf(o.fillRule, ['nonzero', 'evenodd'] as const, 'nonzero', k('fillRule')) };
    case 'rect':
      return { ...base, type, ...painted(), width: finite(o.width, k('width')), height: finite(o.height, k('height')), radius: Math.max(0, finite(o.radius ?? 0, k('radius'))) };
    case 'ellipse':
      return { ...base, type, ...painted(), rx: finite(o.rx, k('rx')), ry: finite(o.ry, k('ry')) };
    case 'polygon': {
      const p = { ...base, type, ...painted(), sides: Math.max(3, Math.round(finite(o.sides, k('sides')))), radius: finite(o.radius, k('radius')) };
      return o.innerRadius === undefined ? p : { ...p, innerRadius: finite(o.innerRadius, k('innerRadius')) };
    }
    case 'text':
      return {
        ...base,
        type,
        ...painted(),
        text: str(o.text, k('text')),
        fontFamily: o.fontFamily === undefined ? 'Inter' : str(o.fontFamily, k('fontFamily')),
        fontWeight: finite(o.fontWeight ?? 400, k('fontWeight')),
        fontStyle: oneOf(o.fontStyle, ['normal', 'italic'] as const, 'normal', k('fontStyle')),
        fontSize: finite(o.fontSize, k('fontSize')),
        letterSpacing: finite(o.letterSpacing ?? 0, k('letterSpacing')),
        lineHeight: finite(o.lineHeight ?? 1.2, k('lineHeight')),
        align: oneOf(o.align, ['left', 'center', 'right'] as const, 'left', k('align')),
      };
    default: // image
      return { ...base, type: 'image', href: str(o.href, k('href')), width: finite(o.width, k('width')), height: finite(o.height, k('height')) };
  }
}

const NO_STROKE = (): Stroke => ({ paint: { kind: 'none' }, width: 1, cap: 'butt', join: 'miter', dash: [] });

function artboard(v: unknown): Artboard {
  const a = obj(v, 'artboard');
  const width = finite(a.width, 'artboard.width');
  const height = finite(a.height, 'artboard.height');
  if (width <= 0) fail('artboard.width', 'must be greater than 0');
  if (height <= 0) fail('artboard.height', 'must be greater than 0');
  return { width, height, background: a.background === undefined ? { kind: 'none' } : paint(a.background, 'artboard.background') };
}

/** Optional app icon marker (`icon`): see src/icon and docs/project-format.md. */
function iconInfo(v: unknown, path: string): { icon?: IconDocInfo } {
  if (v === undefined || v === null) return {};
  const o = obj(v, path);
  const icon: IconDocInfo = {
    preset: oneOf(o.preset, ['app-icon', 'android-adaptive', 'ios', 'favicon-32', 'favicon-16'] as const, 'app-icon', at(path, 'preset')),
    shape: oneOf(o.shape, ['auto', 'circle', 'square', 'wide', 'tall'] as const, 'auto', at(path, 'shape')),
  };
  if (o.smallGlyphProjectId !== undefined) {
    const id = str(o.smallGlyphProjectId, at(path, 'smallGlyphProjectId'));
    if (id) icon.smallGlyphProjectId = id;
  }
  if (o.tile !== undefined && o.tile !== null) {
    const t = normalizeTile(o.tile);
    if (!t) fail(at(path, 'tile'), 'must be a hex colour like #2063b0');
    if (t !== BRAND) icon.tile = t!;
  }
  const colour = oneOf(o.colour, ['one-colour', 'full-colour'] as const, 'one-colour', at(path, 'colour'));
  if (colour === 'full-colour') icon.colour = colour;
  if (o.glyph !== undefined && o.glyph !== null) {
    const g = normalizeTile(o.glyph);
    if (!g) fail(at(path, 'glyph'), 'must be a hex colour like #ffffff');
    if (g !== GLYPH_DEFAULT) icon.glyph = g!;
  }
  return { icon };
}

/**
 * Validates and normalizes a document object (project files, migrated data, CLI input). Throws a
 * readable message naming the JSON path that is wrong. Duplicate node ids are renewed; optional
 * fields (ids, names, opacity, transform parts, stroke, fill…) get their defaults.
 */
/** `live` is sync state, not design: anything malformed is dropped rather than refused. */
function liveInfo(v: unknown): { live?: DesignDocument['live'] } {
  if (!isObj(v)) return {};
  const by = typeof v.editedBy === 'string' ? v.editedBy.trim().slice(0, 100) : '';
  return { live: { editedBy: by || 'cli' } };
}

export function validateDocument(data: unknown, opts: { warnings?: string[] } = {}): DesignDocument {
  const d = isObj(data) ? data : null;
  if (!d || !('schemaVersion' in d) || !Array.isArray(d.children) || !d.artboard) {
    throw new Error('This is not a Designer project file (it needs "schemaVersion": 1, "artboard" and "children").');
  }
  if (typeof d.schemaVersion === 'number' && d.schemaVersion > 1) {
    throw new Error('This project was made with a newer version of Designer.');
  }
  if (d.schemaVersion !== 1) throw new Error('This is not a Designer project file ("schemaVersion" must be 1).');
  try {
    const now = Date.now();
    const warnings = opts.warnings ?? [];
    const wf = wireframeInfo(d.wireframe, 'wireframe', warnings);
    const icon = iconInfo(d.icon, 'icon');
    if (wf.wireframe && icon.icon) fail('wireframe', 'a document is either an app icon ("icon") or a wireframe ("wireframe"), not both');
    const symbols = wf.wireframe ? symbolsInfo((d.wireframe as Obj).symbols, warnings) : [];
    if (wf.wireframe && symbols.length) wf.wireframe.symbols = symbols;
    const ctx: NodeCtx = { ids: new Set<string>(), wireframe: !!wf.wireframe, warnings, symbols: new Set(symbols.map((x) => x.id)) };
    const children = d.children.map((c, i) => node(c, ctx, 0, `children[${i}]`));
    if (wf.wireframe) checkFlows(wf.wireframe, ctx.ids, warnings);
    return {
      schemaVersion: 1,
      id: typeof d.id === 'string' && d.id ? d.id : newId('d'),
      name: typeof d.name === 'string' && d.name.trim() ? d.name : 'Imported',
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : now,
      updatedAt: now,
      artboard: artboard(d.artboard),
      children,
      ...icon,
      ...wf,
      ...liveInfo(d.live),
    };
  } catch (e) {
    if (e instanceof Invalid) throw new Error(`This project file is damaged at ${e.message}.`, { cause: e });
    throw e;
  }
}

/** Parses a `.designer.json` file. Throws with a readable message when invalid; `warnings` collects what was ignored. */
export function parseProject(text: string, opts: { warnings?: string[] } = {}): DesignDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  return validateDocument(data, opts);
}

export function downloadProject(doc: DesignDocument) {
  downloadBlob(new Blob([serializeProject(doc)], { type: 'application/json' }), safeFileName(doc.name) + PROJECT_EXTENSION);
}
