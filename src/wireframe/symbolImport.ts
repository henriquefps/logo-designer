// Importing shared components from another project (docs/wireframe-mode.md → Shared components → Kits, import
// and paste). Pure: plain documents or drafts, no stores. Used by Import components (Library panel), New
// document → "Start with components from", paste between documents (store/clipboard.ts) and the CLI
// (`designer wf components import`, `designer new --kit`).
//
// - The chosen masters are copied with fresh master ids, plus every master they nest (transitively). Their
//   content keeps its node ids (they are in the master's own id space), so master flows keep their `from`.
// - Dedup: a master whose name is the incoming one (or "<name> N") and whose shared content is the same
//   (`masterShape`, node ids ignored, nested masters compared through the import) is reused, not copied.
//   Same name with other content gets "<name> 2". Importing the same kit twice is a no-op.
// - Master flows (`flows[].symbol`) of a copied master follow it when the target has a logical screen with
//   the name of the flow's target screen; the others are dropped and counted.
import type { Draft } from 'immer';
import { newId, type DesignDocument, type GroupNode, type Id, type SceneNode, type WireframeFlow, type WireframeScreen, type WireframeSymbol } from '@/model';
import { deepEqual } from './repeat';
import { masterShape, symbolsOf } from './symbols';
import { plain } from './types';

/** What an import reads from the source: its masters, and for master flows its flows and screens. */
export type SymbolSource = { wireframe?: { screens?: readonly WireframeScreen[]; flows?: readonly WireframeFlow[]; symbols?: readonly WireframeSymbol[] } };
type DocLike = Pick<DesignDocument, 'wireframe'>;

export interface SymbolImport {
  /** Source master id → target master id (copied or reused), for every master the import touched. */
  map: Map<Id, Id>;
  /** Masters copied into the target, dependencies first. */
  added: WireframeSymbol[];
  /** Source masters that matched one the target already had (by name and content). */
  reused: { source: Id; target: Id; name: string }[];
  /** Master flows of the copied masters, retargeted to the target's screens. */
  flows: WireframeFlow[];
  /** Master flows left out: the target has no screen of that name. */
  droppedFlows: number;
}

/** Master ids nested directly in `content` (instances inside it). */
function nestedIds(content: GroupNode): Id[] {
  const out: Id[] = [];
  const visit = (nodes: readonly SceneNode[]) => {
    for (const n of nodes) {
      if (n.type !== 'group') continue;
      if (n.symbol && !n.component) out.push(n.symbol.id);
      visit(n.children);
    }
  };
  visit(content.children);
  return out;
}

/** `ids` and every master they nest, dependencies first (post-order). Unknown ids are skipped. */
export function withNested(symbols: readonly WireframeSymbol[], ids: readonly Id[]): WireframeSymbol[] {
  const byId = new Map(symbols.map((s) => [s.id, s]));
  const out: WireframeSymbol[] = [];
  const seen = new Set<Id>();
  const go = (id: Id) => {
    const s = byId.get(id);
    if (!s || seen.has(id)) return;
    seen.add(id);
    for (const dep of nestedIds(s.content)) go(dep);
    out.push(s);
  };
  for (const id of ids) go(id);
  return out;
}

/** A master's shared shape with node ids replaced by their order and nested master ids passed through `ref`. */
function canonical(s: WireframeSymbol, ref: (id: Id) => Id): unknown {
  let counter = 0;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const isNode = typeof o.type === 'string' && typeof o.id === 'string';
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      if (isNode && k === 'id') out[k] = counter++;
      else if (isNode && k === 'symbol' && x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') out[k] = { id: ref((x as { id: Id }).id) };
      else out[k] = walk(x);
    }
    return out;
  };
  return walk(masterShape(s));
}

/** True when `name` is `base` or `base N` (a renamed copy of an earlier import). */
const sameBase = (name: string, base: string) => name === base || (name.startsWith(base + ' ') && /^\d+$/.test(name.slice(base.length + 1)));

function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** Copies a master's content for the target: new root id and name, nested references through `map`. */
function retarget(content: GroupNode, id: Id, name: string, map: ReadonlyMap<Id, Id>): GroupNode {
  const go = (n: SceneNode): SceneNode => {
    if (n.type !== 'group') return n;
    const symbol = n.symbol && !n.component ? { id: map.get(n.symbol.id) ?? n.symbol.id } : n.symbol;
    return { ...n, ...(symbol ? { symbol } : {}), children: n.children.map(go) };
  };
  return structuredClone({ ...content, id, name, children: content.children.map(go) });
}

const normName = (s: string) => s.trim().toLowerCase();

export interface ImportOptions {
  /** The source masters to import (default: every one). */
  ids?: readonly Id[];
  /** Paste: a source master whose id the target already has is that master (same document lineage). */
  sameIds?: boolean;
}

/**
 * What importing `ids` (default: every master) of `source` into `target` does; changes nothing. Masters
 * nested in the chosen ones come along. See the top of this file for dedup and flows.
 */
export function planSymbolImport(target: DocLike, source: SymbolSource, opts: ImportOptions = {}): SymbolImport {
  const result: SymbolImport = { map: new Map(), added: [], reused: [], flows: [], droppedFlows: 0 };
  const srcSymbols = source.wireframe?.symbols ?? [];
  const existing = symbolsOf(target as Pick<DesignDocument, 'children' | 'wireframe'>);
  const taken = new Set(existing.map((s) => s.name));
  const pool: WireframeSymbol[] = [...existing];
  const ref = (id: Id) => result.map.get(id) ?? id;
  const copied = new Map<Id, Id>();
  for (const s of withNested(srcSymbols, opts.ids ?? srcSymbols.map((x) => x.id))) {
    if (opts.sameIds && existing.some((t) => t.id === s.id)) {
      result.map.set(s.id, s.id);
      continue;
    }
    const shape = canonical(s, ref);
    const match = pool.find((t) => sameBase(t.name, s.name) && deepEqual(canonical(t, (id) => id), shape));
    if (match) {
      result.map.set(s.id, match.id);
      result.reused.push({ source: s.id, target: match.id, name: match.name });
      continue;
    }
    const id = newId('sym');
    const name = uniqueName(s.name, taken);
    taken.add(name);
    result.map.set(s.id, id);
    copied.set(s.id, id);
    const copy: WireframeSymbol = { id, name, content: retarget(s.content, id, name, result.map) };
    result.added.push(copy);
    pool.push(copy);
  }
  // Master flows of the copied masters: kept when the target has a screen of that name.
  const srcScreens = new Map((source.wireframe?.screens ?? []).map((x) => [x.id, x.name]));
  const targetScreens = new Map<string, Id>();
  for (const x of target.wireframe?.screens ?? []) if (!targetScreens.has(normName(x.name))) targetScreens.set(normName(x.name), x.id);
  for (const f of source.wireframe?.flows ?? []) {
    const symbol = f.symbol !== undefined ? copied.get(f.symbol) : undefined;
    if (!symbol) continue;
    const screenName = srcScreens.get(f.to);
    const to = screenName !== undefined ? targetScreens.get(normName(screenName)) : undefined;
    if (!to) {
      result.droppedFlows++;
      continue;
    }
    result.flows.push({ id: newId('f'), from: f.from, to, symbol, ...(f.label ? { label: f.label } : {}), ...(f.part !== undefined ? { part: f.part } : {}) });
  }
  return result;
}

/** Applies a plan to a document or a draft (one `apply` in the app: one undo step). */
export function applySymbolImport(d: Draft<DocLike> | DocLike, plan: SymbolImport): void {
  const wf = d.wireframe;
  if (!wf || (!plan.added.length && !plan.flows.length)) return;
  if (plan.added.length) wf.symbols = [...((wf.symbols ?? []) as WireframeSymbol[]), ...structuredClone(plan.added)] as WireframeSymbol[];
  if (plan.flows.length) wf.flows = [...((wf.flows ?? []) as WireframeFlow[]), ...structuredClone(plan.flows)] as WireframeFlow[];
}

/**
 * Imports shared components from `source` into `target` (a plain document or a draft; it must be a
 * wireframe). Returns what was done. `ids`: the source masters to import (default: all).
 */
export function importSymbols(target: Draft<DocLike> | DocLike, source: SymbolSource, opts: ImportOptions = {}): SymbolImport {
  const plan = planSymbolImport(plain(target as DocLike) as DocLike, source, opts);
  if (target.wireframe) applySymbolImport(target, plan);
  return plan;
}

/** Master ids referenced by instances in `nodes` (anywhere inside them). */
export function referencedSymbols(nodes: readonly SceneNode[]): Id[] {
  const out = new Set<Id>();
  const visit = (list: readonly SceneNode[]) => {
    for (const n of list) {
      if (n.type !== 'group') continue;
      if (n.symbol && !n.component) out.add(n.symbol.id);
      visit(n.children);
    }
  };
  visit(nodes);
  return [...out];
}

/**
 * The part of a document the clipboard carries for `nodes`: the masters their instances use (with the
 * masters those nest), the master flows of those masters and the screens the flows target. Null = none.
 */
export function symbolSourceFor(doc: DocLike, nodes: readonly SceneNode[]): Required<SymbolSource> | null {
  const symbols = withNested(doc.wireframe?.symbols ?? [], referencedSymbols(nodes));
  if (!symbols.length) return null;
  const ids = new Set(symbols.map((s) => s.id));
  const flows = (doc.wireframe?.flows ?? []).filter((f) => f.symbol !== undefined && ids.has(f.symbol));
  const to = new Set(flows.map((f) => f.to));
  const screens = (doc.wireframe?.screens ?? []).filter((s) => to.has(s.id));
  return { wireframe: structuredClone({ screens, flows, symbols }) };
}

/** Points the instances in `nodes` (in place, plain nodes) at their target masters. */
export function remapInstances(nodes: SceneNode[], map: ReadonlyMap<Id, Id>): void {
  if (!map.size) return;
  const visit = (list: SceneNode[]) => {
    for (const n of list) {
      if (n.type !== 'group') continue;
      if (n.symbol && !n.component) {
        const to = map.get(n.symbol.id);
        if (to) n.symbol = { id: to };
      }
      visit(n.children);
    }
  };
  visit(nodes);
}

/**
 * Paste into `target`: masters the pasted instances use that the target does not have (by id) are imported
 * from `source` (same dedup), and the instances are pointed at them. Within the same document every master
 * exists, so nothing changes. Mutates `nodes` (fresh copies) and `target` (a draft).
 */
export function importForPaste(target: Draft<DocLike> | DocLike, nodes: SceneNode[], source: SymbolSource | null | undefined): SymbolImport | null {
  if (!source || !target.wireframe) return null;
  const have = new Set((target.wireframe.symbols ?? []).map((s) => s.id));
  const missing = referencedSymbols(nodes).filter((id) => !have.has(id));
  if (!missing.length) return null;
  const plan = importSymbols(target, source, { ids: missing, sameIds: true });
  remapInstances(nodes, plan.map);
  return plan;
}

/**
 * Paste: instances in `nodes` (in place) whose master `target` does not have become plain groups (an old
 * clipboard without masters, or a document that is not a wireframe), as the symbols step would do.
 */
export function detachUnknownInstances(target: DocLike, nodes: SceneNode[]): void {
  const have = new Set((target.wireframe?.symbols ?? []).map((s) => s.id));
  const visit = (list: SceneNode[]) => {
    for (const n of list) {
      if (n.type !== 'group') continue;
      if (n.symbol && !n.component && !have.has(n.symbol.id)) delete n.symbol;
      visit(n.children);
    }
  };
  visit(nodes);
}
