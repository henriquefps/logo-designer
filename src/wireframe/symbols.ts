// Shared components (user components, docs/wireframe-mode.md → Phase 2 → Shared components). Pure:
// plain documents or drafts, no stores (the app's commands are in ./symbolCommands.ts).
//
// Model
// - A master is `wireframe.symbols[]`: `{ id, name, content }`. `content` is a group in the master's own
//   id space and is not on the canvas. Its `layout` (minus `size`) and its `children` are shared; its
//   `layout.size` and `layoutItem` are only what a new instance starts with.
// - An instance is a group with `symbol: { id }`. Its children are real nodes (like component children and
//   repeat copies), so bounds, hit testing, rendering, export and the CLI need nothing special. Ids are the
//   master's behind a pure prefix, `<instance id>~s~<master id>`; a node the user adds inside an instance
//   keeps its own id there (and that id becomes the master id), every other instance gets the prefixed one.
// - Per instance: the root's id, name, transform, `layoutItem`, `layout.size`, visibility, lock and opacity
//   (position and size; the size follows R1 through the container's layout). Everything else is shared.
// - What the layout computes is not content: the x/y of flow children of a stack, the `layout.size` of a
//   stack in a stack's flow, the `component.size` and the built children of a laid-out component. Those
//   differ between instances of different widths and are ignored when instances are compared (`sharedShape`).
// - Nested instances (an instance inside a master) are stored without children; materializing expands them
//   from their own master. A master can never contain itself (such a reference becomes a plain group).
//
// Sync (the `symbols` step, `syncSymbols`, every phase, same undo step as the change):
// 1. An instance the change edited (it existed before, it changed, and its shared shape no longer matches its
//    master) becomes the master's new content. One per master: the first in document order wins.
// 2. Every other instance whose master changed (or that is new: pasted, duplicated, inserted) and whose
//    shared shape differs from its master gets its children rewritten from the master. Nodes are reconciled
//    by master id, so an unchanged node keeps its identity and its layout values (no jump, no rebuild);
//    a new instance with fresh ids (⌘D, paste) has them mapped by position, and its flows and notes follow.
// 3. An instance of a master that does not exist (pasted from another document) becomes a plain group.
// Runs after `resize` (400) and before `repeat` (450): a repeat template that is an instance is up to date
// before it is copied; copies are never synced on their own.
import type { Draft } from 'immer';
import {
  createGroup,
  newId,
  type DesignDocument,
  type GroupNode,
  type Id,
  type LayoutInfo,
  type SceneNode,
  type Transform,
  type WireframeSymbol,
} from '@/model';
import { getComponent } from './library/registry';
import { resolveProps } from './library/types';
import { deepEqual } from './repeat';
import { plain, type PipelineContext } from './types';

export const SYMBOL_SEP = '~s~';
/** Id prefix of everything inside instance `id`. */
export const instancePrefix = (id: Id) => id + SYMBOL_SEP;

type DocLike = Pick<DesignDocument, 'children' | 'wireframe'>;
export type SymbolInstance = GroupNode & { symbol: { id: Id } };

export const isSymbolInstance = (n: SceneNode): n is SymbolInstance => n.type === 'group' && !!n.symbol;
const NO_SYMBOLS: readonly WireframeSymbol[] = Object.freeze([]);
/** The document's masters (a stable empty list when none: safe in store selectors). */
export const symbolsOf = (doc: DocLike): readonly WireframeSymbol[] => doc.wireframe?.symbols ?? NO_SYMBOLS;
export const getSymbol = (doc: DocLike, id: Id): WireframeSymbol | null => symbolsOf(doc).find((s) => s.id === id) ?? null;

const IDENTITY: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const stripId = (id: Id, prefix: string) => (prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id);
/** A child the parent's stack places (its x/y are the layout's). */
const inFlow = (n: SceneNode, parentLays: boolean) => parentLays && n.layoutItem?.position !== 'free';
/** A copy of `o` without `key`. */
function omit<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> {
  const copy = { ...o };
  delete copy[key];
  return copy;
}
const withoutSize = (l: LayoutInfo): LayoutInfo => omit(l, 'size');

// ---------- comparing instances ----------

function normNode(n: SceneNode, prefix: string, parentLays: boolean): unknown {
  const flow = inFlow(n, parentLays);
  const o: Record<string, unknown> = { ...n, id: stripId(n.id, prefix) };
  if (flow) o.transform = { ...n.transform, x: 0, y: 0 };
  if (n.type === 'group') {
    if (n.component) {
      o.children = undefined; // built from kind + props + size
      if (flow) o.component = { kind: n.component.kind, props: n.component.props };
    } else if (n.symbol) {
      o.children = undefined; // from its own master
      o.layout = undefined;
    } else {
      if (n.layout && flow) o.layout = withoutSize(n.layout);
      o.children = normKids(n.children, prefix, !!n.layout);
    }
  }
  return o;
}

const normKids = (kids: readonly SceneNode[], prefix: string, lays: boolean) => kids.filter((c) => !c.repeatCopy).map((c) => normNode(c, prefix, lays));

const shapeCache = new WeakMap<object, { prefix: string; value: unknown }>();

/**
 * What instances of one master share, in the master's id space: the root's layout (without its size) and
 * the content, without what the layout computes. Two instances are in sync when their shapes are equal.
 * `prefix`: the instance's id prefix (`''` for a master's `content`). Memoized by node identity.
 */
export function sharedShape(root: GroupNode, prefix = instancePrefix(root.id)): unknown {
  const hit = shapeCache.get(root);
  if (hit && hit.prefix === prefix) return hit.value;
  const value = { layout: root.layout ? withoutSize(root.layout) : undefined, children: normKids(root.children, prefix, !!root.layout) };
  shapeCache.set(root, { prefix, value });
  return value;
}

export const masterShape = (s: WireframeSymbol) => sharedShape(s.content, '');

/** True when `inst` shows exactly its master's content. */
export function inSync(inst: GroupNode, s: WireframeSymbol): boolean {
  return deepEqual(sharedShape(inst), masterShape(s));
}

// ---------- instance → master ----------

/** True when master `from` is, or contains (through nested instances), master `target`. */
export function reaches(symbols: readonly WireframeSymbol[], from: Id, target: Id, seen = new Set<Id>()): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const m = symbols.find((s) => s.id === from);
  if (!m) return false;
  let found = false;
  const visit = (nodes: readonly SceneNode[]) => {
    for (const n of nodes) {
      if (found || n.type !== 'group') continue;
      if (n.symbol) found = reaches(symbols, n.symbol.id, target, seen);
      else visit(n.children);
    }
  };
  visit(m.content.children);
  return found;
}

/**
 * The master content an instance shows (plain), in the master's id space: repeat copies left out (the
 * repeat step makes them), nested instances without children. A nested instance that would make the master
 * contain itself is kept as a plain group.
 */
export function contentOf(inst: GroupNode, s: Pick<WireframeSymbol, 'id' | 'name'>, symbols: readonly WireframeSymbol[]): GroupNode {
  const prefix = instancePrefix(inst.id);
  const strip = (n: SceneNode): SceneNode => {
    const id = stripId(n.id, prefix);
    if (n.type !== 'group') return { ...n, id };
    if (n.symbol && !n.component) {
      if (!reaches(symbols, n.symbol.id, s.id)) return { ...n, id, children: [] };
      return { ...omit(n, 'symbol'), id, children: kids(n.children) };
    }
    return { ...n, id, children: kids(n.children) };
  };
  const kids = (list: readonly SceneNode[]) => list.filter((c) => !c.repeatCopy).map(strip);
  return {
    ...createGroup({ name: s.name }),
    id: s.id,
    transform: { ...IDENTITY },
    ...(inst.layout ? { layout: inst.layout } : {}),
    ...(inst.layoutItem ? { layoutItem: inst.layoutItem } : {}),
    children: kids(inst.children),
  };
}

// ---------- master → instance ----------

/** An instance's layout: the master's (shared), with the instance's own size. */
function instanceLayout(shared: LayoutInfo | undefined, own: LayoutInfo | undefined): LayoutInfo | undefined {
  if (!shared) return undefined;
  const size = own?.size ?? shared.size;
  return size ? { ...withoutSize(shared), size } : withoutSize(shared);
}

/** The children of instance `instId` of `content` (plain nodes, ids prefixed, nested instances expanded). */
export function materializeChildren(content: GroupNode, instId: Id, symbols: readonly WireframeSymbol[], stack: readonly Id[] = []): SceneNode[] {
  const prefix = instancePrefix(instId);
  const go = (n: SceneNode): SceneNode => {
    const id = prefix + n.id;
    if (n.type !== 'group') return { ...n, id };
    if (n.symbol && !n.component) {
      const m = symbols.find((s) => s.id === n.symbol!.id);
      if (!m || stack.includes(m.id)) {
        return { ...omit(n, 'symbol'), id, children: n.children.map(go) };
      }
      const layout = instanceLayout(m.content.layout, n.layout);
      return { ...omit(n, 'layout'), ...(layout ? { layout } : {}), id, children: materializeChildren(m.content, id, symbols, [...stack, m.id]) };
    }
    return { ...n, id, children: n.children.map(go) };
  };
  return content.children.map(go);
}

/** Replaces the leading `from` of every id in a subtree with `to` (component children follow their instance's id). */
function reprefix(nodes: readonly SceneNode[], from: string, to: string): SceneNode[] {
  return nodes.map((n) => {
    const id = n.id.startsWith(from) ? to + n.id.slice(from.length) : n.id;
    return n.type === 'group' ? { ...n, id, children: reprefix(n.children, from, to) } : { ...n, id };
  });
}

const sameExceptXY = (a: Transform, b: Transform) => a.rotation === b.rotation && a.scaleX === b.scaleX && a.scaleY === b.scaleY;

/** `want` (from the master), keeping what `have` (the instance's current node) owns: its id and its layout values. */
function reconcileNode(have: SceneNode, want: SceneNode, prefix: string, parentLays: boolean): SceneNode {
  if (have.type !== want.type) return want;
  const flow = inFlow(want, parentLays);
  let w = want;
  if (have.id !== want.id && w.type === 'group' && (w.component || w.symbol)) w = { ...w, children: reprefix(w.children, want.id, have.id) };
  const r: Record<string, unknown> = { ...w, id: have.id };
  if (flow) r.transform = sameExceptXY(have.transform, w.transform) ? have.transform : { ...w.transform, x: have.transform.x, y: have.transform.y };
  if (w.type === 'group' && have.type === 'group') {
    if (w.component) {
      const hc = have.component;
      if (hc && hc.kind === w.component.kind && deepEqual(hc.props, w.component.props) && (flow || deepEqual(hc.size, w.component.size))) {
        r.component = hc;
        r.children = have.children;
      }
    } else {
      if (w.layout && have.layout?.size && (flow || w.symbol)) r.layout = { ...w.layout, size: have.layout.size };
      r.children = reconcileList(have.children, w.children, prefix, !!w.layout);
    }
  }
  return deepEqual(r, have) ? have : (r as unknown as SceneNode);
}

function reconcileList(have: readonly SceneNode[], want: readonly SceneNode[], prefix: string, lays: boolean): SceneNode[] {
  const byMaster = new Map<Id, SceneNode>();
  for (const h of have) if (!h.repeatCopy) byMaster.set(stripId(h.id, prefix), h);
  const out = want.map((w) => {
    const h = byMaster.get(stripId(w.id, prefix));
    return h ? reconcileNode(h, w, prefix, lays) : w;
  });
  // Repeat copies stay; the repeat step rewrites or removes them.
  for (const h of have) if (h.repeatCopy) out.push(h);
  return out;
}

/** Maps the ids of a fresh copy (⌘D, paste: new random ids) onto the master's, by position where the shapes match. */
function mapByPosition(have: readonly SceneNode[], want: readonly SceneNode[], out: Map<Id, Id>) {
  const h = have.filter((n) => !n.repeatCopy);
  for (let i = 0; i < Math.min(h.length, want.length); i++) {
    const a = h[i];
    const b = want[i];
    if (a.type !== b.type) continue;
    if (a.id !== b.id) out.set(a.id, b.id);
    if (a.type === 'group' && b.type === 'group' && !a.component && !b.component) mapByPosition(a.children, b.children, out);
  }
}

function renameIds(nodes: readonly SceneNode[], map: ReadonlyMap<Id, Id>): SceneNode[] {
  return nodes.map((n) => {
    const id = map.get(n.id) ?? n.id;
    if (n.type !== 'group') return id === n.id ? n : { ...n, id };
    return { ...n, id, children: renameIds(n.children, map) };
  });
}

/**
 * What instance `inst` should be (children and layout) to show `s`, reusing its current nodes where
 * they already match. `renames` collects id changes (fresh copies), for flows and notes.
 */
export function syncedInstance(inst: GroupNode, s: WireframeSymbol, symbols: readonly WireframeSymbol[], opts: { fresh?: boolean; renames?: Map<Id, Id> } = {}): { children: SceneNode[]; layout: LayoutInfo | undefined } {
  const want = materializeChildren(s.content, inst.id, symbols, [s.id]);
  let have = inst.children;
  if (opts.fresh) {
    const map = new Map<Id, Id>();
    mapByPosition(have, want, map);
    if (map.size) {
      have = renameIds(have, map);
      for (const [a, b] of map) opts.renames?.set(a, b);
    }
  }
  const layout = instanceLayout(s.content.layout, inst.layout);
  return { children: reconcileList(have, want, instancePrefix(inst.id), !!layout), layout };
}

// ---------- creating, inserting, detaching, deleting ----------

/** Why a node cannot become a shared component (null = it can). `path`: its ancestors, top first. */
export function makeSymbolProblem(n: SceneNode | null | undefined, path: readonly SceneNode[] = []): string | null {
  if (!n || n.type !== 'group') return 'Select a group or a container';
  if (n.screen) return 'A screen cannot be a shared component';
  if (n.note) return 'A note cannot be a shared component';
  if (n.component) return 'A library component is already a component';
  if (n.symbol) return 'This is already a shared component';
  if (n.repeatCopy || path.some((a) => a.repeatCopy || (a.type === 'group' && a.component))) return 'Select the original, not a copy';
  if (!n.children.length && !n.layout) return 'The group is empty';
  return null;
}

const LABEL_PROPS = ['title', 'label', 'text', 'message'];

/** Default name for a new shared component: the container's own name when the user gave one, else the first label inside. */
export function defaultSymbolName(n: GroupNode): string {
  const generic = /^(group|vertical stack|horizontal stack|grid|card container|layer)( \d+)?$/i;
  if (n.name.trim() && !generic.test(n.name.trim())) return n.name.trim();
  let found = '';
  const visit = (nodes: readonly SceneNode[]) => {
    for (const c of nodes) {
      if (found || !c.visible || c.repeatCopy) continue;
      if (c.type === 'text' && c.text.trim()) found = c.text;
      else if (c.type === 'group' && c.component) {
        const def = getComponent(c.component.kind);
        const props = def ? (resolveProps(def, c.component.props) as Record<string, unknown>) : c.component.props;
        for (const k of LABEL_PROPS) if (!found && typeof props[k] === 'string' && (props[k] as string).trim()) found = props[k] as string;
      } else if (c.type === 'group') visit(c.children);
    }
  };
  visit(n.children);
  const label = found.replace(/\s+/g, ' ').trim().slice(0, 40);
  return label || 'Component';
}

function prefixTree(n: SceneNode, prefix: string, map: Map<Id, Id>): SceneNode {
  const id = prefix + n.id;
  map.set(n.id, id);
  return n.type === 'group' ? { ...n, id, children: n.children.map((c) => prefixTree(c, prefix, map)) } : { ...n, id };
}

/** Rewrites flow sources and note targets after ids changed (on a draft). */
export function remapRefs(d: Draft<DocLike>, map: ReadonlyMap<Id, Id>) {
  if (!map.size) return;
  for (const f of d.wireframe?.flows ?? []) {
    const to = map.get(f.from);
    if (to) f.from = to;
  }
  for (const n of d.children) {
    if (n.type === 'group' && n.note?.target !== undefined) {
      const to = map.get(n.note.target);
      if (to) n.note.target = to;
    }
  }
}

function findPath(nodes: readonly SceneNode[], id: Id, path: SceneNode[] = []): SceneNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [...path, n];
    if (n.type === 'group') {
      const r = findPath(n.children, id, [...path, n]);
      if (r) return r;
    }
  }
  return null;
}

function draftAt(d: Draft<DocLike>, path: readonly SceneNode[]): Draft<SceneNode> {
  let list = d.children as Draft<SceneNode>[];
  let node!: Draft<SceneNode>;
  for (const p of path) {
    node = list.find((c) => c.id === p.id)!;
    list = node.type === 'group' ? (node.children as Draft<SceneNode>[]) : [];
  }
  return node;
}

/**
 * Make component (on a draft, inside `apply`): the group / container `nodeId` becomes the first instance
 * of a new master named `name`. Its descendants get instance ids (`<id>~s~<old id>`); flows and notes
 * follow. Returns the new master's id, or null when the node cannot be one (`makeSymbolProblem`).
 */
export function makeSymbol(d: Draft<DocLike>, nodeId: Id, name: string): Id | null {
  const doc = plain(d) as DocLike;
  if (!doc.wireframe) return null;
  const path = findPath(doc.children, nodeId);
  const node = path?.[path.length - 1];
  if (!path || makeSymbolProblem(node, path.slice(0, -1)) || node?.type !== 'group') return null;
  const id = newId('sym');
  const label = name.trim() || defaultSymbolName(node);
  const map = new Map<Id, Id>();
  const children = node.children.map((c) => prefixTree(c, instancePrefix(node.id), map));
  const inst: GroupNode = { ...node, name: label, symbol: { id }, children };
  const symbols = symbolsOf(doc);
  const content = contentOf(inst, { id, name: label }, symbols);
  const draft = draftAt(d, path) as Draft<GroupNode>;
  draft.children = structuredClone(children) as Draft<SceneNode>[];
  draft.symbol = { id };
  draft.name = label;
  const wf = d.wireframe!;
  wf.symbols = [...((wf.symbols ?? []) as WireframeSymbol[]), { id, name: label, content }] as Draft<WireframeSymbol>[];
  remapRefs(d, map);
  return id;
}

/** A new instance of `s` (plain), its top-left at `at` in its parent's space. `width`: a free container's width. */
export function newSymbolInstance(s: WireframeSymbol, symbols: readonly WireframeSymbol[], at: { x: number; y: number }, width?: number): SymbolInstance {
  const id = newId();
  const c = s.content;
  let layout = c.layout;
  if (layout && width !== undefined) layout = { ...layout, size: { width, height: layout.size?.height ?? 0 } };
  // Cloned: a new node shares nothing frozen with the master (the pipeline writes into it).
  return structuredClone({
    ...createGroup({ name: s.name, transform: { x: Math.round(at.x), y: Math.round(at.y) } }),
    id,
    ...(layout ? { layout } : {}),
    ...(c.layoutItem ? { layoutItem: c.layoutItem } : {}),
    symbol: { id: s.id },
    children: materializeChildren(c, id, symbols, [s.id]),
  });
}

/** Detach (on a draft node): the instance becomes plain content (same id, same children). */
export function detachSymbolInstance(node: Draft<SceneNode>): boolean {
  if (node.type !== 'group' || !node.symbol) return false;
  delete node.symbol;
  return true;
}

/** Renames a master (and the instances that still carry its old name). On a draft. */
export function renameSymbol(d: Draft<DocLike>, id: Id, name: string): boolean {
  const s = d.wireframe?.symbols?.find((x) => x.id === id);
  const label = name.trim();
  if (!s || !label || s.name === label) return false;
  const old = s.name;
  s.name = label;
  s.content.name = label;
  const visit = (nodes: Draft<SceneNode>[]) => {
    for (const n of nodes) {
      if (n.type !== 'group') continue;
      if (n.symbol?.id === id && n.name === old) n.name = label;
      visit(n.children as Draft<SceneNode>[]);
    }
  };
  visit(d.children as Draft<SceneNode>[]);
  return true;
}

/** Instances of master `id` on the canvas (repeat copies left out). */
export function instancesOf(doc: DocLike, id: Id): SymbolInstance[] {
  const out: SymbolInstance[] = [];
  const visit = (nodes: readonly SceneNode[]) => {
    for (const n of nodes) {
      if (n.type !== 'group' || n.repeatCopy || n.component) continue;
      if (n.symbol?.id === id) out.push(n as SymbolInstance);
      visit(n.children);
    }
  };
  visit(doc.children);
  return out;
}

/**
 * Delete master (on a draft): every instance becomes plain content (copies too), nested instances in other
 * masters get their content filled in, and the master goes.
 */
export function deleteSymbol(d: Draft<DocLike>, id: Id): boolean {
  const wf = d.wireframe;
  const symbols = (plain(wf?.symbols) ?? []) as WireframeSymbol[];
  const s = symbols.find((x) => x.id === id);
  if (!wf || !s) return false;
  const visit = (nodes: Draft<SceneNode>[]) => {
    for (const n of nodes) {
      if (n.type !== 'group') continue;
      if (n.symbol?.id === id) delete n.symbol;
      visit(n.children as Draft<SceneNode>[]);
    }
  };
  visit(d.children as Draft<SceneNode>[]);
  wf.symbols!.forEach((m, i) => {
    if (m.id === id) return;
    const fill = (nodes: readonly SceneNode[]): SceneNode[] =>
      nodes.map((n) => {
        if (n.type !== 'group') return n;
        if (n.symbol?.id === id) {
          return { ...omit(n, 'symbol'), children: materializeChildren(s.content, n.id, symbols, [id]) };
        }
        return { ...n, children: fill(n.children) };
      });
    const content = symbols[i].content;
    const next = fill(content.children);
    if (!deepEqual(next, content.children)) wf.symbols![i].content = structuredClone({ ...content, children: next }) as Draft<GroupNode>;
  });
  wf.symbols = wf.symbols!.filter((x) => x.id !== id);
  if (!wf.symbols.length) delete wf.symbols;
  return true;
}

// ---------- the pipeline step ----------

type Path = number[];

function nodeAt(d: Draft<{ children: SceneNode[] }>, path: Path): Draft<SceneNode> {
  let list = d.children as Draft<SceneNode>[];
  let node!: Draft<SceneNode>;
  for (const i of path) {
    node = list[i];
    list = node.type === 'group' ? (node.children as Draft<SceneNode>[]) : [];
  }
  return node;
}

interface Found {
  path: Path;
  node: SymbolInstance;
}

/** Instances in document order (outer before inner). `all`: every subtree, else only those the change touched. */
function findInstances(nodes: readonly SceneNode[], ctx: PipelineContext, all: boolean, path: Path, out: Found[]) {
  nodes.forEach((n, i) => {
    if (n.type !== 'group' || n.component || n.repeatCopy) return;
    if (!all && ctx.phase !== 'load' && ctx.previous(n.id) === n) return;
    const p = [...path, i];
    if (n.symbol) out.push({ path: p, node: n as SymbolInstance });
    findInstances(n.children, ctx, all, p, out);
  });
}

const under = (path: Path, root: Path) => path.length > root.length && root.every((v, i) => path[i] === v);

/** The `symbols` step (see the top of this file). */
export function syncSymbols(d: Draft<DesignDocument>, ctx: PipelineContext): void {
  const doc = plain(d) as DesignDocument;
  const wf = doc.wireframe;
  if (!wf) return;
  const original = wf.symbols ?? [];
  const before = ctx.before?.wireframe?.symbols ?? [];
  if (!original.length && !before.length && ctx.phase !== 'load') {
    // No masters: only instances pasted from another document can need work (they become plain groups).
    const stray: Found[] = [];
    findInstances(doc.children, ctx, false, [], stray);
    for (const f of stray) delete (nodeAt(d, f.path) as Draft<GroupNode>).symbol;
    return;
  }

  // 1. Edits: an instance that existed, changed, and no longer matches its master becomes the master.
  const changed = new Map<Id, WireframeSymbol>();
  const sources = new Set<Id>();
  if (ctx.phase !== 'load') {
    const touched: Found[] = [];
    findInstances(doc.children, ctx, false, [], touched);
    for (const { node } of touched) {
      const prev = ctx.previous(node.id);
      if (!prev || prev === node || prev.type !== 'group' || prev.symbol?.id !== node.symbol.id) continue;
      const s = original.find((x) => x.id === node.symbol.id);
      if (!s || changed.has(s.id) || inSync(node, s)) continue;
      changed.set(s.id, { ...s, content: contentOf(node, s, original) });
      sources.add(node.id);
    }
  }
  const symbols = original.map((s) => changed.get(s.id) ?? s);
  if (changed.size) {
    const draftList = d.wireframe!.symbols!;
    draftList.forEach((s, i) => {
      const next = changed.get(s.id);
      if (next) draftList[i].content = next.content as Draft<GroupNode>;
    });
  }

  // 2. Every instance whose master changed (or that the change touched) follows its master.
  const prevById = new Map(before.map((s) => [s.id, s]));
  const moved = new Set(symbols.filter((s) => ctx.phase === 'load' || prevById.get(s.id)?.content !== s.content || changed.has(s.id)).map((s) => s.id));
  const all: Found[] = [];
  findInstances(doc.children, ctx, ctx.phase === 'load' || moved.size > 0, [], all);
  const renames = new Map<Id, Id>();
  const rewritten: Path[] = [];
  for (const { path, node } of all) {
    if (rewritten.some((r) => under(path, r))) continue; // its outer instance was rewritten (nested ones expanded)
    const s = symbols.find((x) => x.id === node.symbol.id);
    const draft = () => nodeAt(d, path) as Draft<GroupNode>;
    if (!s) {
      delete draft().symbol; // a master that does not exist (pasted from another document): plain content
      continue;
    }
    if (sources.has(node.id)) continue;
    const prev = ctx.phase === 'load' ? null : ctx.previous(node.id);
    if (!moved.has(s.id) && prev === node) continue;
    if (inSync(node, s)) continue;
    const next = syncedInstance(node, s, symbols, { fresh: !prev, renames });
    const target = draft();
    if (next.children.length !== node.children.length || next.children.some((c, i) => c !== node.children[i])) {
      const reuse = new Map(node.children.map((c, i) => [c, target.children[i]]));
      // New nodes are cloned: they share frozen parts with the master, and later steps write into them.
      target.children = next.children.map((c) => reuse.get(c) ?? (structuredClone(c) as Draft<SceneNode>));
    }
    if (!deepEqual(next.layout, node.layout)) {
      if (next.layout) target.layout = structuredClone(next.layout) as Draft<LayoutInfo>;
      else delete target.layout;
    }
    rewritten.push(path);
  }
  remapRefs(d, renames);
}
