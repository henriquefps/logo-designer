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
  const only = instances ? new Set(instances) : null;
  const added: WireframeFlow[] = [];
  for (const f of shared) {
    for (const id of flowSources(doc, f)) {
      const ref = masterRef(doc, id);
      if (!ref || ref.symbol !== symbol || (only && !only.has(ref.instance))) continue;
      added.push({ id: newId('f'), from: id, to: f.to, ...(f.label ? { label: f.label } : {}), ...(f.part !== undefined ? { part: f.part } : {}) });
    }
  }
  if (!added.length) return 0;
  wf.flows!.push(...added);
  return added.length;
}

// ---------- arrow geometry (document space) ----------

export interface FlowCurve {
  /** Cubic Bézier: start, two controls, end. */
  points: [Vec, Vec, Vec, Vec];
  /** Unit direction of the curve at its end (the arrowhead's direction). */
  dir: Vec;
}

/** Keeps the end point this far from a frame's corners. */
const EDGE_INSET = 24;
const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** The curve of a flow from a source rectangle to a target frame rectangle. */
export function curveBetween(s: Rect, t: Rect): FlowCurve {
  const sc = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  const tc = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
  const right = tc.x >= sc.x;
  const start = { x: right ? s.x + s.width : s.x, y: sc.y };
  const out = { x: right ? 1 : -1, y: 0 };
  let end: Vec;
  let dir: Vec;
  if (t.x >= start.x) {
    end = { x: t.x, y: clamp(start.y, t.y + EDGE_INSET, t.y + t.height - EDGE_INSET) };
    dir = { x: 1, y: 0 };
  } else if (t.x + t.width <= start.x) {
    end = { x: t.x + t.width, y: clamp(start.y, t.y + EDGE_INSET, t.y + t.height - EDGE_INSET) };
    dir = { x: -1, y: 0 };
  } else if (t.y >= start.y) {
    end = { x: clamp(start.x, t.x + EDGE_INSET, t.x + t.width - EDGE_INSET), y: t.y };
    dir = { x: 0, y: 1 };
  } else if (t.y + t.height <= start.y) {
    end = { x: clamp(start.x, t.x + EDGE_INSET, t.x + t.width - EDGE_INSET), y: t.y + t.height };
    dir = { x: 0, y: -1 };
  } else {
    // The source is inside the target (a flow to its own screen): out to the frame's nearest side.
    end = right ? { x: t.x + t.width, y: start.y } : { x: t.x, y: start.y };
    dir = { x: -out.x, y: 0 };
    const k = Math.max(40, Math.abs(end.x - start.x) / 2);
    const bulge = 60;
    return { points: [start, { x: start.x + out.x * k, y: start.y - bulge }, { x: end.x + out.x * bulge, y: end.y - bulge }, end], dir };
  }
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const k = Math.max(40, dist / 2.5);
  return { points: [start, { x: start.x + out.x * k, y: start.y + out.y * k }, { x: end.x - dir.x * k, y: end.y - dir.y * k }, end], dir };
}

/** Where a flow starts on canvas node `source`: its part's rectangle, else the node's bounds (document space). */
export function flowSourceRect(doc: DocLike, source: Id, part?: string): Rect | null {
  return part !== undefined ? (partWorldRect(doc, source, part) ?? worldBounds(asDoc(doc), source)) : worldBounds(asDoc(doc), source);
}

/**
 * The arrows of a flow, one per canvas node it starts at (a shared flow: one per instance), each from the source (or
 * its part) to the nearest edge of the target frame. Hidden ends draw nothing; a shared flow draws nothing on the
 * screen it opens (the tab bar's own tab: it would point at its own screen on every screen).
 */
export function flowCurves(doc: DocLike, flow: WireframeFlow): { source: Id; curve: FlowCurve }[] {
  const out: { source: Id; curve: FlowCurve }[] = [];
  for (const id of flowSources(doc, flow)) {
    const loc = locate(asDoc(doc), id);
    if (!loc || !loc.node.visible || loc.ancestors.some((a) => !a.visible)) continue;
    const origin = frameOf(doc, id);
    const target = flowTarget(doc, flow, origin);
    if (!target || !target.visible) continue;
    if (flow.symbol && origin && origin.screen.screenId === flow.to) continue;
    const s = flowSourceRect(doc, id, flow.part);
    if (s) out.push({ source: id, curve: curveBetween(s, frameRect(target)) });
  }
  return out;
}

/** The (first) arrow of a flow, or null when either end is missing or hidden. */
export const flowCurve = (doc: DocLike, flow: WireframeFlow): FlowCurve | null => flowCurves(doc, flow)[0]?.curve ?? null;

/** A point on a cubic Bézier. */
export function bezierAt([a, b, c, d]: readonly [Vec, Vec, Vec, Vec], t: number): Vec {
  const u = 1 - t;
  const k0 = u * u * u;
  const k1 = 3 * u * u * t;
  const k2 = 3 * u * t * t;
  const k3 = t * t * t;
  return { x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x, y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y };
}

function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from `p` to a flow curve (sampled). */
export function distanceToCurve(curve: FlowCurve, p: Vec): number {
  let best = Infinity;
  let prev = curve.points[0];
  for (let i = 1; i <= 32; i++) {
    const q = bezierAt(curve.points, i / 32);
    best = Math.min(best, distToSegment(p, prev, q));
    prev = q;
  }
  return best;
}

/** The flow whose arrow passes within `tolerance` (document units) of `p`, the last drawn first. */
export function flowAt(doc: DocLike, p: Vec, tolerance: number): Id | null {
  const list = flowsOf(doc);
  for (let i = list.length - 1; i >= 0; i--) {
    for (const { curve } of flowCurves(doc, list[i])) if (distanceToCurve(curve, p) <= tolerance) return list[i].id;
  }
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
