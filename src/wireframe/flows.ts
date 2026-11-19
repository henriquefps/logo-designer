// Flows and screen status of wireframe documents (docs/wireframe-mode.md → Phase 2: Flows, Screen
// status). A flow is `wireframe.flows[]`: { id, from: node inside a frame, to: logical screen, label? }.
// Arrows are a canvas overlay (canvas/FlowArrows.tsx), never part of a screen export.
//
// Pure functions on plain documents or immer drafts, shared by the app (flowCommands.ts), the
// pipeline (`flows` step: flows die with their source node or target screen), the export for AI and,
// later, present mode: `flowsFrom(doc, nodeId)` = the hotspots of an element, `flowTarget(doc, flow,
// fromFrame)` = the frame to show next.
import {
  findNode,
  isComponentNode,
  isScreenNode,
  locate,
  newId,
  walk,
  worldBounds,
  type DesignDocument,
  type Id,
  type Rect,
  type ScreenNode,
  type ScreenStatus,
  type Vec,
  type WireframeFlow,
} from '@/model';
import { getComponent } from './library/registry';
import { resolveProps } from './library/types';
import { addScreen, frameOf, frameRect, frames, variantsOf } from './screens';
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

/** Outgoing flows of a node (its hotspots in present mode), in creation order. */
export const flowsFrom = (doc: DocLike, nodeId: Id): WireframeFlow[] => flowsOf(doc).filter((f) => f.from === nodeId);

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
  const origin = fromFrame === undefined ? frameOf(doc, flow.from) : fromFrame;
  return (origin && variants.find((v) => v.screen.platform === origin.screen.platform)) || variants[0];
}

/**
 * Adds a flow from `from` (resolved with `flowSource`) to the logical screen `to`. An existing flow
 * between the same two gets the label instead of a duplicate. Returns the flow id, or null when
 * `from` is not an element inside a screen or `to` is not a logical screen.
 */
export function addFlow(doc: DocLike, from: Id, to: Id, label?: string): Id | null {
  const wf = doc.wireframe;
  if (!wf) return null;
  const source = flowSource(doc, from);
  if (!source || !wf.screens.some((s) => s.id === to)) return null;
  const text = label?.trim();
  const existing = (wf.flows ?? []).find((f) => f.from === source && f.to === to);
  if (existing) {
    if (text && existing.label !== text) existing.label = text;
    return existing.id;
  }
  const flow: WireframeFlow = { id: newId('f'), from: source, to, ...(text ? { label: text } : {}) };
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
  const screens = new Set(wf.screens.map((s) => s.id));
  const keep = wf.flows.filter((f) => ids.has(f.from) && screens.has(f.to));
  const removed = wf.flows.length - keep.length;
  if (!removed) return 0;
  if (keep.length) wf.flows = keep;
  else delete wf.flows;
  return removed;
}

// ---------- naming and New screen ----------

/** Props that name what an element says, in order of preference (list row → title, button → label…). */
const LABEL_PROPS = ['label', 'title', 'text', 'message'];

/** What the element says, for naming the screen it opens: a component's label / title / text, a text's content, else the node name. */
export function flowSourceLabel(doc: DocLike, nodeId: Id): string {
  const n = findNode(asDoc(doc), nodeId);
  if (!n) return '';
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
export function newScreenFromFlow(doc: DocLike, fromId: Id, at: Vec): { frameId: Id; screenId: Id; flowId: Id } | null {
  const source = flowSource(doc, fromId);
  if (!source || !doc.wireframe) return null;
  const platform = frameOf(doc, source)?.screen.platform ?? 'phone';
  const name = flowSourceLabel(doc, source).slice(0, 60) || undefined;
  const frameId = addScreen(doc, { platform, name, x: Math.round(at.x), y: Math.round(at.y) });
  const frame = frames(doc).find((f) => f.id === frameId)!;
  const flowId = addFlow(doc, source, frame.screen.screenId)!;
  return { frameId, screenId: frame.screen.screenId, flowId };
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

/** The arrow of a flow (source element → nearest edge of the target frame), or null when either end is missing or hidden. */
export function flowCurve(doc: DocLike, flow: WireframeFlow): FlowCurve | null {
  const from = findNode(asDoc(doc), flow.from);
  if (!from || !from.visible) return null;
  const origin = frameOf(doc, flow.from);
  if (origin && !origin.visible) return null;
  const target = flowTarget(doc, flow, origin);
  if (!target || !target.visible) return null;
  const s = worldBounds(asDoc(doc), flow.from);
  if (!s) return null;
  return curveBetween(s, frameRect(target));
}

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
    const c = flowCurve(doc, list[i]);
    if (c && distanceToCurve(c, p) <= tolerance) return list[i].id;
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
