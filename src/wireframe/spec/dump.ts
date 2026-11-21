// Project → spec (docs/wireframe-spec.md): what an agent reads to see a project, including what
// Henrique edited by hand. Every stated node gets its id, so `build --into` updates it in place.
// Defaults are left out (props, layout values, names), so the spec stays short; geometry the layout
// computes (positions and sizes in a stack) is left out too, and geometry nobody computes (free
// positions, fixed sizes, frame positions, notes) is written. `buildFromSpec(dumpToSpec(p))` gives
// back `p` (tested in __tests__/roundtrip.test.ts).
import { platformDef, walk, type DesignDocument, type GroupNode, type Id, type LayoutInfo, type SceneNode, type ScreenNode, type WireframeSymbol } from '@/model';
import { partsOfNode } from '../flows';
import { getComponent } from '../library/registry';
import { checkProp, type PropSpec } from '../library/types';
import { defaultLayout, defaultScreenLayout } from '../layout';
import { frames } from '../screens';
import { isNoteNode, notesOf } from '../notes';
import { deepEqual } from '../repeat';
import { instancePrefix, slotsOf } from '../symbols';
import { primaryTextProp } from './parse';
import { defaultName, hasDefaultPlacement, layoutShape, placedByLayout } from './common';
import { SPEC_SCHEMA_URL, SPEC_VERSION, type SpecComponent, type SpecFlow, type SpecFrameLayout, type SpecNode, type SpecNote, type SpecScreen, type SpecVariant, type WireframeSpec } from './types';

interface DumpCtx {
  symbols: readonly WireframeSymbol[];
  /** A master's name when it is unique (else its id): what `use` refers to. */
  useRef: (id: Id) => string;
  /** false: leave out positions and sizes (`build --into` then keeps the project's). */
  geometry: boolean;
}

export interface DumpOptions {
  /**
   * Default true. false leaves out every position and size (node x / y / width / height / size, frame x / y /
   * width, note x / y): for an agent that edits the spec and builds it back `--into` the project, so moves and
   * resizes made in the app meanwhile are kept.
   */
  geometry?: boolean;
}

/** Props that differ from the definition's defaults (unknown keys are not written). */
function propsDiff(kind: string, props: Record<string, unknown>): Record<string, unknown> | null {
  const def = getComponent(kind);
  if (!def) return null;
  const specs = def.props as Record<string, PropSpec>;
  if (Object.keys(props).some((k) => !specs[k])) return null;
  const out: Record<string, unknown> = {};
  for (const [k, spec] of Object.entries(specs)) {
    if (props[k] === undefined) continue;
    const r = checkProp(spec, props[k]);
    if (r.problem) return null; // a bad stored value: keep the node raw rather than change it
    if (!deepEqual(r.value, checkProp(spec, undefined).value)) out[k] = r.value;
  }
  return out;
}

const r2 = (v: number) => Math.round(v * 1000) / 1000;

/** Keys every form shares. `parentLays`: the parent lays this node out. `frameChild`: a direct child of a frame. */
function commonKeys(n: SceneNode, ctx: DumpCtx, parentLays: boolean, frameChild: boolean): SpecNode {
  const o: SpecNode = { id: n.id };
  const name = defaultName(n, (id) => ctx.symbols.find((s) => s.id === id)?.name);
  if (n.name !== name) o.name = n.name;
  if (!n.visible) o.hidden = true;
  if (n.locked) o.locked = true;
  if (n.opacity !== 1) o.opacity = n.opacity;
  const it = n.layoutItem;
  if (it?.width !== undefined && ctx.geometry) o.width = it.width;
  if (it?.height !== undefined && ctx.geometry) o.height = it.height;
  if (it?.position !== undefined) o.position = it.position;
  else if (frameChild && parentLays && hasDefaultPlacement(n)) o.position = 'flow'; // else the build would pin / float it
  if (it?.bleed !== undefined) o.bleed = it.bleed;
  if (!placedByLayout(n, parentLays) && ctx.geometry) {
    o.x = r2(n.transform.x);
    o.y = r2(n.transform.y);
    if (n.transform.rotation) o.rotation = n.transform.rotation;
    if (n.transform.scaleX !== 1 || n.transform.scaleY !== 1) o.scale = [n.transform.scaleX, n.transform.scaleY];
    const box = n.type === 'group' ? (n.component?.size ?? (n.layout && !n.screen ? n.layout.size : undefined)) : undefined;
    if (box) o.size = { width: r2(box.width), height: r2(box.height) };
  }
  return o;
}

/** A container's layout values that differ from `defaultLayout(kind)`. */
function layoutDiff(l: LayoutInfo): Record<string, unknown> {
  const d = defaultLayout(l.kind);
  const out: Record<string, unknown> = {};
  if (l.gap !== d.gap) out.gap = l.gap;
  if (l.padding !== d.padding) out.padding = l.padding;
  if (l.align !== d.align) out.align = l.align;
  if (l.kind === 'grid' && l.columns !== d.columns) out.columns = l.columns;
  if (l.style !== undefined) out.style = l.style;
  if (l.radius !== undefined) out.radius = l.radius;
  if (l.repeat) out.repeat = l.repeat.count;
  if (l.slot) out.slot = true;
  return out;
}

const raw = (n: SceneNode): SpecNode => ({ node: structuredClone(n) });

/** How a dump names a part: its label when no other part of the node has it (an agent reads and edits labels), else its key. */
export function partRef(n: SceneNode | null | undefined, key: string): string {
  const parts = partsOfNode(n);
  const p = parts.find((x) => x.key === key);
  const label = p?.label.trim().toLowerCase();
  if (!p || !label || /[/#]/.test(label) || parts.filter((x) => x.label.trim().toLowerCase() === label).length > 1) return key;
  return p.label.trim();
}

/** One node of a screen tree (or of a master's content: `inMaster`). Null for generated nodes. */
function dumpNode(n: SceneNode, ctx: DumpCtx, parentLays: boolean, frameChild = false): SpecNode | null {
  if (n.repeatCopy) return null;
  if (n.type !== 'group') return raw(n);
  const common = commonKeys(n, ctx, parentLays, frameChild);
  if (n.symbol) {
    const s = ctx.symbols.find((x) => x.id === n.symbol!.id);
    if (!s) return raw(n);
    // A per-instance layout box only matters when no layout places it (handled by commonKeys' `size`).
    return { use: ctx.useRef(s.id), ...instanceOwn(n, s, ctx), ...common };
  }
  if (n.component) {
    const props = propsDiff(n.component.kind, n.component.props);
    if (!props) return raw(n);
    return { [n.component.kind]: props, ...common };
  }
  if (n.layout && !n.screen) {
    const children = n.children.map((c) => dumpNode(c, ctx, true)).filter((c): c is SpecNode => !!c);
    return { [n.layout.kind]: children, ...layoutDiff(n.layout), ...common };
  }
  if (n.note || n.screen) return raw(n);
  const children = n.children.map((c) => dumpNode(c, ctx, false)).filter((c): c is SpecNode => !!c);
  return { group: children, ...common };
}

const withoutIds = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(withoutIds);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (k !== 'id') out[k] = withoutIds(x);
  return out;
};

/** How a dump names a master node (a slot, a component with text): its name when unique, else its path of names, else its id. */
function masterRef(s: WireframeSymbol, id: Id): string {
  const all: { n: SceneNode; path: string }[] = [];
  const visit = (nodes: readonly SceneNode[], at: string) => {
    for (const n of nodes) {
      const p = at ? `${at}/${n.name}` : n.name;
      all.push({ n, path: p });
      if (n.type === 'group' && !n.component && !n.symbol) visit(n.children, p);
    }
  };
  visit(s.content.children, '');
  const hit = all.find((x) => x.n.id === id);
  if (!hit || !hit.n.name.trim()) return id;
  const lc = (x: string) => x.trim().toLowerCase();
  if (all.filter((x) => lc(x.n.name) === lc(hit.n.name)).length === 1 && !hit.n.name.includes('/')) return hit.n.name;
  if (all.filter((x) => lc(x.path) === lc(hit.path)).length === 1) return hit.path;
  return id;
}

/** What an instance has of its own: slot content that differs from the master's default (`content` / `slots`), and `text`. */
function instanceOwn(n: GroupNode, s: WireframeSymbol, ctx: DumpCtx): SpecNode {
  const out: SpecNode = {};
  const slots = slotsOf(s.content);
  const prefix = instancePrefix(n.id);
  const fills: Record<string, SpecNode[]> = {};
  for (const slot of slots) {
    const holder = findIn(n.children, prefix + slot.id);
    if (!holder || holder.type !== 'group') continue;
    const mine = holder.children.map((c) => dumpNode(c, ctx, true)).filter((c): c is SpecNode => !!c);
    const def = slot.children.map((c) => dumpNode(c, ctx, true)).filter((c): c is SpecNode => !!c);
    if (deepEqual(withoutIds(mine), withoutIds(def))) continue;
    fills[slots.length === 1 ? '' : masterRef(s, slot.id)] = mine;
  }
  if (slots.length === 1 && fills['']) out.content = fills[''];
  else if (Object.keys(fills).length) out.slots = fills;
  const text = n.symbol?.text;
  if (text) {
    const t: Record<string, unknown> = {};
    const masterNodes = new Map<Id, SceneNode>();
    walk(s.content.children, (x) => {
      masterNodes.set(x.id, x);
      return !(x.type === 'group' && (x.component || x.symbol));
    });
    for (const [id, props] of Object.entries(text)) {
      const target = masterNodes.get(id);
      const def = target?.type === 'group' && target.component ? getComponent(target.component.kind) : undefined;
      const keys = Object.keys(props);
      t[masterRef(s, id)] = def && keys.length === 1 && keys[0] === primaryTextProp(def) ? props[keys[0]] : { ...props };
    }
    if (Object.keys(t).length) out.text = t;
  }
  return out;
}

function findIn(nodes: readonly SceneNode[], id: Id): SceneNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === 'group' && !n.component && !n.symbol) {
      const hit = findIn(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** A frame's root layout as the spec writes it (undefined = the platform default). */
function frameLayout(f: ScreenNode): SpecFrameLayout | undefined {
  if (!f.layout) return 'free';
  const d = defaultScreenLayout(f.screen.platform);
  const l = layoutShape(f.layout);
  if (deepEqual(l, d)) return undefined;
  const out: Exclude<SpecFrameLayout, 'free'> = {};
  if (l.kind !== d.kind) out.kind = l.kind;
  if (l.gap !== d.gap) out.gap = l.gap;
  if (l.padding !== d.padding) out.padding = l.padding;
  if (l.align !== d.align) out.align = l.align;
  if (l.kind === 'grid' && l.columns !== 2) out.columns = l.columns;
  return out;
}

function dumpVariant(f: ScreenNode, ctx: DumpCtx): SpecVariant {
  const v: SpecVariant = { platform: f.screen.platform, id: f.id };
  if (ctx.geometry) {
    v.x = r2(f.transform.x);
    v.y = r2(f.transform.y);
    if (f.screen.width !== platformDef(f.screen.platform).width) v.width = f.screen.width;
  }
  const layout = frameLayout(f);
  if (layout !== undefined) v.layout = layout;
  v.root = f.children.map((c) => dumpNode(c, ctx, !!f.layout, true)).filter((c): c is SpecNode => !!c);
  return v;
}

/** The spec of a wireframe project. Throws for other documents. */
export function dumpToSpec(doc: DesignDocument, opts: DumpOptions = {}): WireframeSpec {
  const wf = doc.wireframe;
  if (!wf) throw new Error('not a wireframe project');
  const symbols = wf.symbols ?? [];
  const nameCount = new Map<string, number>();
  for (const s of symbols) nameCount.set(s.name.toLowerCase(), (nameCount.get(s.name.toLowerCase()) ?? 0) + 1);
  const ctx: DumpCtx = {
    symbols,
    geometry: opts.geometry !== false,
    useRef: (id) => {
      const s = symbols.find((x) => x.id === id)!;
      return nameCount.get(s.name.toLowerCase()) === 1 ? s.name : s.id;
    },
  };
  const spec: WireframeSpec = { $schema: SPEC_SCHEMA_URL, version: SPEC_VERSION, name: doc.name, ...(symbols.length ? { components: [] } : {}), screens: [] };
  if (symbols.length) {
    spec.components = symbols.map((s): SpecComponent => {
      const content = dumpNode(s.content, ctx, false)!;
      // The content's id, name and place are the component's.
      for (const k of ['id', 'name', 'x', 'y', 'size', 'rotation', 'scale']) delete content[k];
      return { name: s.name, id: s.id, content };
    });
  }
  const all = frames(doc);
  for (const s of wf.screens) {
    const variants = all.filter((f) => f.screen.screenId === s.id).map((f) => dumpVariant(f, ctx));
    if (!variants.length) continue;
    const screen: SpecScreen = { name: s.name, id: s.id };
    if (s.status) screen.status = s.status;
    if (variants.length === 1) {
      const { id, ...rest } = variants[0];
      Object.assign(screen, { ...rest, frameId: id });
      // Key order: name, id, status, platform, frameId, x, y, width, layout, root.
      const ordered: SpecScreen = { name: screen.name, id: screen.id };
      for (const k of ['status', 'platform', 'frameId', 'x', 'y', 'width', 'layout', 'root'] as const) if (screen[k] !== undefined) (ordered as unknown as Record<string, unknown>)[k] = screen[k];
      spec.screens.push(ordered);
    } else spec.screens.push({ ...screen, variants });
  }
  const canvas = doc.children.filter((c) => !(c.type === 'group' && (c.screen || isNoteNode(c))));
  if (canvas.length) spec.canvas = canvas.map((c) => dumpNode(c, ctx, false)).filter((c): c is SpecNode => !!c);
  // A part: "<node>#Files"; a shared flow (defined in a master) starts with the component: "Tab bar/<node id>#Files"
  // (its id when a screen has that name).
  const flows = wf.flows ?? [];
  const nodeById = new Map<string, SceneNode>();
  if (flows.some((f) => f.part !== undefined)) {
    walk(doc.children, (n) => void nodeById.set(n.id, n));
    for (const m of symbols) walk(m.content.children, (n) => void nodeById.set(`${m.id}\u0000${n.id}`, n));
  }
  const screenNames = new Set(wf.screens.map((x) => x.name.toLowerCase()));
  if (flows.length) {
    spec.flows = flows.map((f): SpecFlow => {
      const target = wf.screens.find((s) => s.id === f.to);
      const node = nodeById.get(f.symbol ? `${f.symbol}\u0000${f.from}` : f.from);
      const head = f.symbol ? `${screenNames.has(ctx.useRef(f.symbol).toLowerCase()) ? f.symbol : ctx.useRef(f.symbol)}/` : '';
      return { id: f.id, from: `${head}${f.from}${f.part !== undefined ? `#${partRef(node, f.part)}` : ''}`, to: target?.name ?? f.to, ...(f.label ? { label: f.label } : {}) };
    });
  }
  const notes = notesOf(doc);
  if (notes.length) {
    spec.notes = notes.map((n): SpecNote => ({ id: n.id, text: n.note.text, ...(n.note.target ? { on: n.note.target } : {}), ...(ctx.geometry ? { x: r2(n.transform.x), y: r2(n.transform.y) } : {}) }));
  }
  return spec;
}
