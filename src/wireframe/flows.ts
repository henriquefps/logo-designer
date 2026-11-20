// Flows and screen status of wireframe documents (docs/wireframe-mode.md → Phase 2: Flows, Screen
// status; → Links from parts of a component). A flow is `wireframe.flows[]`: { id, from: node inside a
// frame, to: logical screen, label?, part?, symbol? }. Arrows are a canvas overlay (canvas/FlowArrows.tsx),
// never part of a screen export.
//
// - `part`: the flow starts at a part of the component instance `from` (a bottom navigation item: `item:2`),
//   see the definition's `parts`. Parts of list props are remapped when the list changes (`remapPartKey`,
//   the `parts` pipeline step).
// - `symbol`: the flow is defined in a shared component's master; `from` is a node of the master content and
//   the flow applies to every instance (`flowSources` lists the canvas nodes it starts at). Without it, a flow
//   from inside an instance belongs to that instance only.
//
// Pure functions on plain documents or immer drafts, shared by the app (flowCommands.ts), the
// pipeline (`flows` step: flows die with their source node or target screen), the export for AI and,
// later, present mode: `flowsFrom(doc, nodeId)` = the hotspots of an element, `flowTarget(doc, flow,
// fromFrame)` = the frame to show next.
import {
  apply,
  findNode,
  isComponentNode,
  isScreenNode,
  locate,
  newId,
  rectFromPoints,
  walk,
  worldBounds,
  worldMatrix,
  type ComponentInfo,
  type DesignDocument,
  type GroupNode,
  type Id,
  type Rect,
  type SceneNode,
  type ScreenNode,
  type ScreenStatus,
  type Vec,
  type WireframeFlow,
} from '@/model';
import { getComponent } from './library/registry';
import { checkProp, partsOf, resolveProps, type AnyComponentDef, type ComponentPart, type PropSpec } from './library/types';
import { addScreen, frameOf, frameRect, frames, variantsOf } from './screens';
import { instancePrefix } from './symbols';
import { deepEqual } from './repeat';
import { noteRect, notesOf } from './notes';
import { distanceToRoute, routeFlows, type FlowRoute, type RouteOptions, type RouteRequest } from './routing';
import { plain } from './types';

type DocLike = Pick<DesignDocument, 'children' | 'wireframe'>;
const asDoc = (doc: DocLike) => doc as DesignDocument;

// ---------- screen status ----------

export const SCREEN_STATUSES: readonly ScreenStatus[] = ['current', 'changed', 'new'];
export const STATUS_LABELS: Record<ScreenStatus, string> = { current: 'Current', changed: 'Changed', new: 'New' };

export const screenStatus = (doc: DocLike, screenId: Id): ScreenStatus | undefined => doc.wireframe?.screens.find((s) => s.id === screenId)?.status;

/** Sets (or clears, with null) a logical screen's status. False when the screen does not exist or nothing changed. */
export function setScreenStatus(doc: DocLike, screenId: Id, status: ScreenStatus | null): boolean {
  const s = doc.wireframe?.screens.find((x) => x.id === screenId);
  if (!s || (s.status ?? null) === status) return false;
  if (status) s.status = status;
  else delete s.status;
  return true;
}

// ---------- the model ----------

export const flowsOf = (doc: DocLike): WireframeFlow[] => doc.wireframe?.flows ?? [];

/** Flows defined on the canvas node `nodeId` itself (not the shared ones that apply to it), in creation order. */
export const flowsFrom = (doc: DocLike, nodeId: Id): WireframeFlow[] => flowsOf(doc).filter((f) => f.from === nodeId && !f.symbol);

/** True for a flow defined in a shared component's master (it applies to every instance). */
export const isSharedFlow = (f: Pick<WireframeFlow, 'symbol'>): boolean => !!f.symbol;

// ---------- parts ----------

const partsCache = new WeakMap<ComponentInfo, ComponentPart[]>();

/** The parts of a component instance (local rects), or [] for other nodes and components without parts. */
export function partsOfNode(n: SceneNode | null | undefined): ComponentPart[] {
  if (!n || n.type !== 'group' || !n.component) return [];
  const c = n.component;
  const hit = partsCache.get(c);
  if (hit) return hit;
  const def = getComponent(c.kind);
  const parts = def ? partsOf(def, c.props, c.size ?? def.defaultSize, c.resolved) : [];
  partsCache.set(c, parts);
  return parts;
}

/** Parts of the canvas node `id`. */
export const partsOfId = (doc: DocLike, id: Id): ComponentPart[] => partsOfNode(findNode(asDoc(doc), id));

/** A part's rectangle in document space, or null when the node or the part is not there. */
export function partWorldRect(doc: DocLike, id: Id, key: string): Rect | null {
  const part = partsOfId(doc, id).find((p) => p.key === key);
  if (!part) return null;
  const m = worldMatrix(asDoc(doc), id);
  const { x, y, width, height } = part.rect;
  return rectFromPoints([apply(m, { x, y }), apply(m, { x: x + width, y }), apply(m, { x: x + width, y: y + height }), apply(m, { x, y: y + height })]);
}

/** The part of node `id` under a document point (the last listed wins on overlap), or null. */
export function partAt(doc: DocLike, id: Id, p: Vec): ComponentPart | null {
  const parts = partsOfId(doc, id);
  for (let i = parts.length - 1; i >= 0; i--) {
    const r = partWorldRect(doc, id, parts[i].key);
    if (r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return parts[i];
  }
  return null;
}

/** True when other parts of the node share part `key`'s row (tabs side by side): its handle sits on its top and its arrow leaves vertically (top or bottom). */
export function partInRow(doc: DocLike, id: Id, key: string): boolean {
  const parts = partsOfId(doc, id);
  const me = parts.find((p) => p.key === key);
  if (!me) return false;
  return parts.some((p) => p.key !== key && p.rect.y < me.rect.y + me.rect.height - 1 && p.rect.y + p.rect.height > me.rect.y + 1);
}

/** A part's label ("Arquivos"), or the key when the part is not drawn now. */
export const partLabel = (doc: DocLike, id: Id, key: string): string => partsOfId(doc, id).find((p) => p.key === key)?.label ?? key;

/**
 * Where a flow on part `key` goes when a list prop of the component changes (docs/wireframe-mode.md → Reorder/rename
 * safety): the item keeps its flow when its label is still in the list (first match), else by its old index when
 * that is still in range and the entry there is not one of the old ones (a rename), else the flow goes (null).
 * Keys of fixed parts, and of lists that did not change, are returned as they are.
 */
export function remapPartKey(def: AnyComponentDef, before: Record<string, unknown>, after: Record<string, unknown>, key: string): string | null {
  const m = /^([a-z][a-z-]*):(\d+)$/.exec(key);
  const prop = m ? def.partLists?.[m[1]] : undefined;
  const spec = prop ? (def.props as Record<string, PropSpec>)[prop] : undefined;
  if (!m || !spec || spec.type !== 'list') return key;
  const old = checkProp(spec, before[prop!]).value as string[];
  const now = checkProp(spec, after[prop!]).value as string[];
  if (deepEqual(old, now)) return key;
  const i = Number(m[2]);
  const label = old[i];
  if (label === undefined) return i < now.length ? key : null;
  const j = now.indexOf(label);
  if (j >= 0) return `${m[1]}:${j}`;
  if (i < now.length && !old.includes(now[i])) return key;
  return null;
}

// ---------- shared components: one link for every instance ----------

/**
 * The shared component a canvas node belongs to: the innermost instance containing it, the master and the node's
 * id in the master's content. Null outside instances (and for an instance's root itself, which is per instance).
 */
export function masterRef(doc: DocLike, nodeId: Id): { symbol: Id; from: Id; instance: Id } | null {
  const loc = locate(asDoc(doc), nodeId);
  if (!loc) return null;
  for (let i = loc.ancestors.length - 1; i >= 0; i--) {
    const a = loc.ancestors[i];
    if (a.symbol && !a.component) {
      const prefix = instancePrefix(a.id);
      return { symbol: a.symbol.id, from: nodeId.startsWith(prefix) ? nodeId.slice(prefix.length) : nodeId, instance: a.id };
    }
  }
  return null;
}

const occurrenceCache = new WeakMap<object, Map<string, Id[]>>();
const occKey = (symbol: Id, from: Id) => `${symbol}\u0000${from}`;

/** `symbol + master id` → the canvas nodes showing that master node (one per instance), memoized per document tree. */
function occurrences(doc: DocLike): Map<string, Id[]> {
  const hit = occurrenceCache.get(doc.children);
  if (hit) return hit;
  const out = new Map<string, Id[]>();
  const visit = (nodes: readonly SceneNode[], inst: GroupNode | null) => {
    for (const n of nodes) {
      if (n.repeatCopy) continue; // copies follow their template (present mode maps them)
      if (inst) {
        const prefix = instancePrefix(inst.id);
        const k = occKey(inst.symbol!.id, n.id.startsWith(prefix) ? n.id.slice(prefix.length) : n.id);
        const list = out.get(k);
        if (list) list.push(n.id);
        else out.set(k, [n.id]);
      }
      if (n.type !== 'group' || n.component) continue;
      visit(n.children, n.symbol ? n : inst);
    }
  };
  for (const top of doc.children) if (isScreenNode(top)) visit(top.children, null);
  occurrenceCache.set(doc.children, out);
  return out;
}

/** The canvas nodes a flow starts at: `from` itself, or (a shared flow) that master node in every instance on a screen. */
export function flowSources(doc: DocLike, flow: Pick<WireframeFlow, 'from' | 'symbol'>): Id[] {
  if (!flow.symbol) return findNode(asDoc(doc), flow.from) ? [flow.from] : [];
  return occurrences(doc).get(occKey(flow.symbol, flow.from)) ?? [];
}

/** Every flow that starts at canvas node `nodeId`: its own and the shared ones of its master node. */
export function flowsAt(doc: DocLike, nodeId: Id): WireframeFlow[] {
  const all = flowsOf(doc);
  if (!all.length) return [];
  const ref = all.some((f) => f.symbol) ? masterRef(doc, nodeId) : null;
  return all.filter((f) => (f.symbol ? !!ref && f.symbol === ref.symbol && f.from === ref.from : f.from === nodeId));
}

/** Flows that open a logical screen. */
export const flowsTo = (doc: DocLike, screenId: Id): WireframeFlow[] => flowsOf(doc).filter((f) => f.to === screenId);

/**
 * The node a flow from `id` starts at: `id` itself, or the component instance it was generated
 * for (generated children are not elements). Null when `id` is not inside a screen frame (the
 * frame itself, a note, a node on the bare canvas, a repeat copy, a missing id).
 */
export function flowSource(doc: DocLike, id: Id): Id | null {
  const loc = locate(asDoc(doc), id);
  if (!loc || !loc.ancestors.length || !isScreenNode(loc.ancestors[0])) return null;
  // Repeat copies (and their content) are generated: flows start at the template, never at a copy.
  if (loc.node.repeatCopy || loc.ancestors.some((a) => a.repeatCopy)) return null;
  const owner = loc.ancestors.slice(1).find((a) => isComponentNode(a));
  return owner ? owner.id : id;
}

export const canFlowFrom = (doc: DocLike, id: Id): boolean => !!doc.wireframe && flowSource(doc, id) === id;

/**
 * The frame a flow points at, seen from `fromFrame` (default: the frame that contains the flow's
 * source): the target logical screen's variant with the same platform, else its first frame.
 * Null when the target screen has no frame.
 */
export function flowTarget(doc: DocLike, flow: Pick<WireframeFlow, 'from' | 'to'>, fromFrame?: ScreenNode | null): ScreenNode | null {
  const variants = variantsOf(doc, flow.to);
  if (!variants.length) return null;
  const origin = fromFrame === undefined ? frameOf(doc, (flow as Pick<WireframeFlow, 'symbol'>).symbol ? (flowSources(doc, flow as WireframeFlow)[0] ?? flow.from) : flow.from) : fromFrame;
  return (origin && variants.find((v) => v.screen.platform === origin.screen.platform)) || variants[0];
}

export interface AddFlowOptions {
  /** A part of the instance (`item:2`); it must be one of its parts now. */
  part?: string;
  /**
   * The source is inside a shared component's instance: true defines the flow in the master, so it applies to every
   * instance ("Every screen using Tab bar"); false / absent keeps it on this instance ("This screen only").
   */
  shared?: boolean;
}

/**
 * Adds a flow from `from` (resolved with `flowSource`) to the logical screen `to`. An existing flow
 * between the same two (same part, same scope) gets the label instead of a duplicate. Returns the flow id, or null
 * when `from` is not an element inside a screen, `to` is not a logical screen, the part is not one of the element's,
 * or `shared` is asked for an element that is not inside a shared component.
 */
export function addFlow(doc: DocLike, from: Id, to: Id, label?: string, opts: AddFlowOptions = {}): Id | null {
  const wf = doc.wireframe;
  if (!wf) return null;
  const source = flowSource(doc, from);
  if (!source || !wf.screens.some((s) => s.id === to)) return null;
  if (opts.part !== undefined && !partsOfId(doc, source).some((p) => p.key === opts.part)) return null;
  let at: Pick<WireframeFlow, 'from' | 'symbol'> = { from: source };
  if (opts.shared) {
    const ref = masterRef(doc, source);
    if (!ref) return null;
    at = { from: ref.from, symbol: ref.symbol };
  }
  const text = label?.trim();
  const existing = (wf.flows ?? []).find((f) => f.from === at.from && f.to === to && (f.part ?? null) === (opts.part ?? null) && (f.symbol ?? null) === (at.symbol ?? null));
  if (existing) {
    if (text && existing.label !== text) existing.label = text;
    return existing.id;
  }
  const flow: WireframeFlow = { id: newId('f'), from: at.from, to, ...(text ? { label: text } : {}), ...(opts.part !== undefined ? { part: opts.part } : {}), ...(at.symbol ? { symbol: at.symbol } : {}) };
  if (!wf.flows) wf.flows = [];
  wf.flows.push(flow);
  return flow.id;
}

export function removeFlow(doc: DocLike, flowId: Id): boolean {
  const wf = doc.wireframe;
  const i = wf?.flows?.findIndex((f) => f.id === flowId) ?? -1;
  if (!wf?.flows || i < 0) return false;
  wf.flows.splice(i, 1);
  if (!wf.flows.length) delete wf.flows;
  return true;
}

/** Sets a flow's label ('' clears it). */
export function setFlowLabel(doc: DocLike, flowId: Id, label: string): boolean {
  const f = doc.wireframe?.flows?.find((x) => x.id === flowId);
  if (!f) return false;
  const text = label.trim();
  if ((f.label ?? '') === text) return false;
  if (text) f.label = text;
  else delete f.label;
  return true;
}

/**
 * Removes the flows whose source node or target logical screen no longer exists (the `flows`
 * pipeline step runs it, so a delete and its flows are one undo step). Returns how many.
 */
export function pruneFlows(doc: DocLike): number {
  const wf = doc.wireframe;
  if (!wf?.flows) return 0;
  const ids = new Set<Id>();
  walk(plain(doc.children), (n) => void ids.add(n.id));
  const masters = new Map<Id, Set<Id>>();
  for (const s of plain(wf.symbols) ?? []) {
    const inside = new Set<Id>();
    walk(s.content.children, (n) => void inside.add(n.id));
    masters.set(s.id, inside);
  }
  const screens = new Set(wf.screens.map((s) => s.id));
  const keep = wf.flows.filter((f) => (f.symbol ? !!masters.get(f.symbol)?.has(f.from) : ids.has(f.from)) && screens.has(f.to));
  const removed = wf.flows.length - keep.length;
  if (!removed) return 0;
  if (keep.length) wf.flows = keep;
  else delete wf.flows;
  return removed;
}

// ---------- copies (duplicate, copy-paste) ----------

/** Old id → new id for a node and its copy (a structured clone with fresh ids has the same shape). */
export function copyIdMap(original: SceneNode, copy: SceneNode, map: Map<Id, Id> = new Map()): Map<Id, Id> {
  map.set(original.id, copy.id);
  if (original.type === 'group' && copy.type === 'group') original.children.forEach((c, i) => copy.children[i] && copyIdMap(c, copy.children[i], map));
  return map;
}

/** Flows (plain copies) whose source is `nodes` or inside them, for the clipboard. */
export function flowsInside(doc: DocLike, nodes: readonly SceneNode[]): WireframeFlow[] {
  const flows = flowsOf(doc);
  if (!flows.length) return [];
  const ids = new Set<Id>();
  for (const n of nodes) walk([plain(n) as SceneNode], (x) => void ids.add(x.id));
  return flows.filter((f) => !f.symbol && ids.has(f.from)).map((f) => ({ ...f }));
}

/** New flows (fresh ids, same targets and labels) for the copies of `flows`' sources; flows from nodes without a copy are skipped. */
export function copyFlows(flows: readonly WireframeFlow[], ids: ReadonlyMap<Id, Id>): WireframeFlow[] {
  const out: WireframeFlow[] = [];
  for (const f of flows) {
    const from = ids.get(f.from);
    if (from && !f.symbol) out.push({ id: newId('f'), from, to: f.to, ...(f.label ? { label: f.label } : {}), ...(f.part !== undefined ? { part: f.part } : {}) });
  }
  return out;
}

/**
 * Adds copied flows to `doc`, keeping only those whose target is a logical screen of the document or
 * one of `extraScreens` (screens carried by pasted frames). Returns how many were added.
 */
export function attachFlows(doc: DocLike, flows: readonly WireframeFlow[], extraScreens: Iterable<Id> = []): number {
  const wf = doc.wireframe;
  if (!wf || !flows.length) return 0;
  const targets = new Set<Id>([...wf.screens.map((s) => s.id), ...extraScreens]);
  const keep = flows.filter((f) => targets.has(f.to));
  if (!keep.length) return 0;
  if (!wf.flows) wf.flows = [];
  wf.flows.push(...keep);
  return keep.length;
}

/** Logical screen ids carried by the frames among `nodes` (top-level). */
export const screenIdsOf = (nodes: readonly SceneNode[]): Id[] => nodes.filter(isScreenNode).map((f) => f.screen.screenId);

// ---------- naming and New screen ----------

/** Props that name what an element says, in order of preference (list row → title, button → label…). */
const LABEL_PROPS = ['label', 'title', 'text', 'message'];

/**
 * What the element says, for naming the screen it opens: a part's label ("Arquivos"), a component's label / title /
 * text, a text's content, else the node name.
 */
export function flowSourceLabel(doc: DocLike, nodeId: Id, part?: string): string {
  const n = findNode(asDoc(doc), nodeId);
  if (!n) return '';
  if (part !== undefined) {
    const label = partsOfNode(n).find((p) => p.key === part)?.label;
    if (label?.trim()) return label.replace(/\s+/g, ' ').trim();
  }
  if (n.type === 'group' && n.component) {
    const def = getComponent(n.component.kind);
    const props = def ? (resolveProps(def, n.component.props) as Record<string, unknown>) : n.component.props;
    for (const k of LABEL_PROPS) {
      const v = props[k];
      if (typeof v === 'string' && v.trim()) return v.replace(/\s+/g, ' ').trim();
    }
  }
  if (n.type === 'text' && n.text.trim()) return n.text.replace(/\s+/g, ' ').trim();
  return n.name.trim();
}

/**
 * "New screen" when a flow is dropped on empty canvas: a logical screen with one frame of the
 * source's platform, its top-left at `at`, named after the source's label, and a flow to it.
 */
export function newScreenFromFlow(doc: DocLike, fromId: Id, at: Vec, opts: AddFlowOptions = {}): { frameId: Id; screenId: Id; flowId: Id } | null {
  const source = flowSource(doc, fromId);
  if (!source || !doc.wireframe) return null;
  if (opts.part !== undefined && !partsOfId(doc, source).some((p) => p.key === opts.part)) return null;
  if (opts.shared && !masterRef(doc, source)) return null;
  const platform = frameOf(doc, source)?.screen.platform ?? 'phone';
  const name = flowSourceLabel(doc, source, opts.part).slice(0, 60) || undefined;
  const frameId = addScreen(doc, { platform, name, x: Math.round(at.x), y: Math.round(at.y) });
  const frame = frames(doc).find((f) => f.id === frameId)!;
  const flowId = addFlow(doc, source, frame.screen.screenId, undefined, opts)!;
  return { frameId, screenId: frame.screen.screenId, flowId };
}

/**
 * Turns the shared flows of master `symbol` into flows of the instances' own nodes (each instance in `instances`, or
 * every one): before Detach or Delete master, so the links stay on the screens. Returns how many were added.
 */
export function localizeSharedFlows(doc: DocLike, symbol: Id, instances?: readonly Id[]): number {
  const wf = doc.wireframe;
  const shared = (wf?.flows ?? []).filter((f) => f.symbol === symbol);
  if (!wf || !shared.length) return 0;
  const read = plain(doc as DesignDocument);
  const only = instances ? new Set(instances) : null;
  const added: WireframeFlow[] = [];
  for (const f of shared) {
    for (const id of flowSources(read, f)) {
      const ref = masterRef(read, id);
      if (!ref || ref.symbol !== symbol || (only && !only.has(ref.instance))) continue;
      added.push({ id: newId('f'), from: id, to: f.to, ...(f.label ? { label: f.label } : {}), ...(f.part !== undefined ? { part: f.part } : {}) });
    }
  }
  if (!added.length) return 0;
  wf.flows!.push(...added);
  return added.length;
}

// ---------- arrow geometry (document space) ----------

/** One arrow of a flow: from canvas node `source` (a shared flow has one per instance), routed around the frames. */
export interface FlowArrow {
  flow: WireframeFlow;
  source: Id;
  route: FlowRoute;
}

export interface FlowLayoutOptions {
  /** A shared flow draws from the instance containing a node of the selection (see `flowArrows`). */
  selection?: readonly Id[];
  /** One arrow per instance for shared flows. */
  all?: boolean;
  /** Only these frames are drawn (`wf sheet --platform`): arrows to or from others are dropped, others are no obstacles. */
  shown?: (f: ScreenNode) => boolean;
  /** Notes are soft obstacles (default true). */
  notes?: boolean;
  /** Document units kept clear above each frame for its name (see `canvasLabelBand`). Default 0. */
  band?: number;
  /** Document units per screen px: scales the spacing between arrows sharing a lane. Default 1. */
  unit?: number;
}

export interface FlowLayout {
  arrows: FlowArrow[];
  /** What labels must not cover: the frames (with their name strips) and the notes. */
  avoid: Rect[];
}

/** The name strip above a frame on the canvas, in document units at `zoom`, in steps (so routes are cached across small zooms). */
export function canvasLabelBand(zoom: number): number {
  return 30 / 2 ** Math.floor(Math.log2(Math.max(zoom, 1 / 64)));
}

/** Document units per screen px at `zoom`, in the same steps as `canvasLabelBand`. */
export const canvasUnit = (zoom: number): number => 1 / 2 ** Math.floor(Math.log2(Math.max(zoom, 1 / 64)));

/** The canvas's routing options at `zoom` (the overlay, arrow picking and the arrow editor share them). */
export const canvasArrowOptions = (zoom: number, selection?: readonly Id[]): FlowLayoutOptions => ({ selection, band: canvasLabelBand(zoom), unit: canvasUnit(zoom) });

/** Where a flow starts on canvas node `source`: its part's rectangle, else the node's bounds (document space). */
export function flowSourceRect(doc: DocLike, source: Id, part?: string): Rect | null {
  return part !== undefined ? (partWorldRect(doc, source, part) ?? worldBounds(asDoc(doc), source)) : worldBounds(asDoc(doc), source);
}

interface Pending {
  flow: WireframeFlow;
  source: Id;
  req: RouteRequest;
}

/** The arrows to draw, before routing: visible ends only, one per shared flow unless `all`. */
function pendingArrows(doc: DocLike, opts: FlowLayoutOptions, frameIndex: Map<Id, number>): Pending[] {
  const out: Pending[] = [];
  for (const flow of flowsOf(doc)) {
    let sources = flowSources(doc, flow);
    if (flow.symbol && !opts.all && sources.length > 1) {
      const picked = opts.selection?.length ? sources.find((id) => opts.selection!.some((sel) => { const ref = masterRef(doc, id); return !!ref && (sel === ref.instance || sel.startsWith(instancePrefix(ref.instance))); })) : undefined;
      sources = picked ? [picked] : sources;
    }
    for (const id of sources) {
      const loc = locate(asDoc(doc), id);
      if (!loc || !loc.node.visible || loc.ancestors.some((a) => !a.visible)) continue;
      const origin = frameOf(doc, id);
      const target = flowTarget(doc, flow, origin);
      if (!target || !target.visible) continue;
      if (flow.symbol && origin && origin.screen.screenId === flow.to) continue;
      const to = frameIndex.get(target.id);
      const from = origin ? frameIndex.get(origin.id) : undefined;
      if (to === undefined || (origin && from === undefined)) continue;
      const s = flowSourceRect(doc, id, flow.part);
      if (s) out.push({ flow, source: id, req: { source: s, from: from ?? -1, to, vertical: flow.part !== undefined && partInRow(doc, id, flow.part) } });
      if (flow.symbol && !opts.all) break;
    }
  }
  return out;
}

const rectKey = (r: Rect) => `${Math.round(r.x * 10)},${Math.round(r.y * 10)},${Math.round(r.width * 10)},${Math.round(r.height * 10)}`;

/** The last routed sets (routing depends on every arrow): a drag that moves no arrow end costs a key compare. */
const layoutCache: { key: string; routes: FlowRoute[] }[] = [];
const LAYOUT_CACHE = 4;
/** Whole layouts per document tree (and wireframe info), for repeated calls on an unchanged document. */
const docLayouts = new WeakMap<object, { wireframe: unknown; key: string; layout: FlowLayout }[]>();

/**
 * Every arrow of the document, routed around the frames (src/wireframe/routing.ts): one per flow (shared flows: from
 * the instance containing a node of `selection`, else the first instance not on the screen it opens; `all`: one per
 * instance). Hidden ends draw nothing. Memoized per layout.
 */
export function flowLayout(doc: DocLike, opts: FlowLayoutOptions = {}): FlowLayout {
  const shownFrames = frames(doc).filter((f) => f.visible && (!opts.shown || opts.shown(f)));
  const frameIndex = new Map(shownFrames.map((f, i) => [f.id, i]));
  const rects = shownFrames.map(frameRect);
  const noteRects = opts.notes === false ? [] : notesOf(doc).filter((n) => n.visible).map(noteRect);
  const band = opts.band ?? 0;
  const unit = opts.unit ?? 1;
  const ropts: RouteOptions = { band, notes: noteRects, clearance: Math.max(24, 12 * unit), gap: Math.min(10 * unit, 40) };
  const avoid = [...rects.map((r) => ({ x: r.x, y: r.y - band, width: r.width, height: r.height + band })), ...noteRects];
  // The same document state and options (pointer moves, re-renders): the same layout. Only for frozen (store)
  // documents: plain ones (the CLI, tests) can change in place under the same arrays.
  const frozen = Object.isFrozen(doc.children);
  const sel = flowsOf(doc).some((f) => f.symbol) ? (opts.selection ?? []).join(',') : '';
  const optsKey = `${band}|${unit}|${opts.notes !== false}|${!!opts.all}|${sel}|${shownFrames.map((f) => f.id).join(',')}`;
  const memo = frozen ? docLayouts.get(doc.children) : undefined;
  const known = memo?.find((m) => m.wireframe === doc.wireframe && m.key === optsKey);
  if (known) return known.layout;
  const remember = (layout: FlowLayout) => {
    const list = memo ?? [];
    list.unshift({ wireframe: doc.wireframe, key: optsKey, layout });
    if (list.length > 4) list.pop();
    if (!memo && frozen) docLayouts.set(doc.children, list);
    return layout;
  };

  const pending = pendingArrows(doc, opts, frameIndex);
  if (!pending.length) return remember({ arrows: [], avoid });

  const key = `${band}|${unit}|${rects.map(rectKey).join(';')}|${noteRects.map(rectKey).join(';')}#${pending.map((p) => `${rectKey(p.req.source)}>${p.req.from}>${p.req.to}${p.req.vertical ? 'v' : ''}`).join('|')}`;
  let hit = layoutCache.find((c) => c.key === key);
  if (!hit) {
    hit = { key, routes: routeFlows(pending.map((p) => p.req), rects, ropts) };
    layoutCache.unshift(hit);
    if (layoutCache.length > LAYOUT_CACHE) layoutCache.pop();
  }
  const routes = hit.routes;
  return remember({ arrows: pending.map((p, i) => ({ flow: p.flow, source: p.source, route: routes[i] })), avoid });
}

/** The arrows of one flow (see `flowLayout`). */
export function flowArrows(doc: DocLike, flow: Pick<WireframeFlow, 'id'>, opts: FlowLayoutOptions = {}): FlowArrow[] {
  return flowLayout(doc, opts).arrows.filter((a) => a.flow.id === flow.id);
}

/** The (first) arrow's route of a flow, or null when either end is missing or hidden. */
export const flowRoute = (doc: DocLike, flow: Pick<WireframeFlow, 'id'>, opts: FlowLayoutOptions = {}): FlowRoute | null => flowArrows(doc, flow, opts)[0]?.route ?? null;

/** The flow whose arrow passes within `tolerance` (document units) of `p`, the last drawn first. */
export function flowAt(doc: DocLike, p: Vec, tolerance: number, opts: FlowLayoutOptions = {}): Id | null {
  const { arrows } = flowLayout(doc, opts);
  for (let i = arrows.length - 1; i >= 0; i--) if (distanceToRoute(arrows[i].route, p) <= tolerance) return arrows[i].flow.id;
  return null;
}

/** The frame under a document point (topmost visible), for dropping a flow. */
export function frameAt(doc: DocLike, p: Vec): ScreenNode | null {
  for (const f of [...frames(doc)].reverse()) {
    if (!f.visible) continue;
    const r = frameRect(f);
    if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return f;
  }
  return null;
}
