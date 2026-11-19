// Present mode navigation (docs/wireframe-mode.md → Present mode): a pure state machine over a
// document. The state is the frame on show and a history stack of frames; every function returns a
// new state and never touches the document (present mode is read-only).
import { findNode, locate, worldBounds, type DesignDocument, type Id, type Rect, type ScreenNode, type ScreenPlatform, type WireframeFlow } from '@/model';
import { flowTarget, flowsOf } from './flows';
import { frameOf, frameRect, frames, variantsOf } from './screens';

type DocLike = Pick<DesignDocument, 'children' | 'wireframe'>;
const asDoc = (doc: DocLike) => doc as DesignDocument;

export interface PresentState {
  /** The frame on show. */
  frameId: Id;
  /** Frames visited before this one, oldest first (Back pops the last). */
  history: Id[];
}

export interface Hotspot {
  /** The element the hotspot sits on. */
  nodeId: Id;
  /** In the frame's local space (0..width × 0..height), clipped to the frame. */
  rect: Rect;
  /** The flow a click follows (the element's first one). */
  flow: WireframeFlow;
  /** Every flow of the element (labels for the hover hint). */
  flows: WireframeFlow[];
}

const presentable = (doc: DocLike) => frames(doc).filter((f) => f.visible);

/** The frame on show, or null when it no longer exists. */
export const presentedFrame = (doc: DocLike, s: PresentState): ScreenNode | null => frames(doc).find((f) => f.id === s.frameId) ?? null;

/**
 * Where present mode starts: the frame of the first selected object (the frame itself or anything
 * inside it), else the first screen. Null when the document has no screen to show.
 */
export function startPresent(doc: DocLike, selection: readonly Id[] = []): PresentState | null {
  const all = presentable(doc);
  if (!all.length) return null;
  for (const id of selection) {
    const f = frameOf(doc, id);
    if (f && f.visible) return { frameId: f.id, history: [] };
  }
  return { frameId: all[0].id, history: [] };
}

/** The frame a flow leads to from the frame on show (same platform when the target has it), or null. */
export function resolveTarget(doc: DocLike, s: PresentState, flow: Pick<WireframeFlow, 'from' | 'to'>): ScreenNode | null {
  const current = presentedFrame(doc, s);
  const target = flowTarget(doc, flow, current);
  return target && target.visible ? target : null;
}

/** Follows a flow: the target becomes the current frame, the current one goes on the history. Unchanged when the flow leads nowhere or to the same frame. */
export function follow(doc: DocLike, s: PresentState, flow: Pick<WireframeFlow, 'from' | 'to'>): PresentState {
  const target = resolveTarget(doc, s, flow);
  if (!target || target.id === s.frameId) return s;
  return { frameId: target.id, history: [...s.history, s.frameId] };
}

export const canGoBack = (s: PresentState) => s.history.length > 0;

/** Back to the previous frame (skipping frames that are gone). Unchanged when the history is empty. */
export function back(doc: DocLike, s: PresentState): PresentState {
  const existing = new Set(frames(doc).map((f) => f.id));
  const history = [...s.history];
  while (history.length) {
    const id = history.pop()!;
    if (existing.has(id)) return { frameId: id, history };
  }
  return s;
}

/** Platforms the logical screen on show has frames for, in the order phone, tablet, desktop. */
export function platformsOf(doc: DocLike, s: PresentState): ScreenPlatform[] {
  const f = presentedFrame(doc, s);
  if (!f) return [];
  const have = new Set(variantsOf(doc, f.screen.screenId).filter((v) => v.visible).map((v) => v.screen.platform));
  return (['phone', 'tablet', 'desktop'] as const).filter((p) => have.has(p));
}

/** Shows another variant of the logical screen on show. History is untouched (it is the same screen). */
export function switchPlatform(doc: DocLike, s: PresentState, platform: ScreenPlatform): PresentState {
  const f = presentedFrame(doc, s);
  if (!f) return s;
  const v = variantsOf(doc, f.screen.screenId).find((x) => x.visible && x.screen.platform === platform);
  return v && v.id !== s.frameId ? { ...s, frameId: v.id } : s;
}

const isShown = (doc: DocLike, id: Id): boolean => {
  const loc = locate(asDoc(doc), id);
  return !!loc && loc.node.visible && loc.ancestors.every((a) => a.visible);
};

/** The elements of the frame on show that have flows, with their rectangles in the frame's space. */
export function hotspots(doc: DocLike, s: PresentState): Hotspot[] {
  const frame = presentedFrame(doc, s);
  if (!frame) return [];
  const origin = frameRect(frame);
  const byNode = new Map<Id, WireframeFlow[]>();
  for (const f of flowsOf(doc)) {
    if (!byNode.has(f.from)) byNode.set(f.from, []);
    byNode.get(f.from)!.push(f);
  }
  const out: Hotspot[] = [];
  for (const [nodeId, flows] of byNode) {
    if (nodeId === frame.id || frameOf(doc, nodeId)?.id !== frame.id || !isShown(doc, nodeId) || !findNode(asDoc(doc), nodeId)) continue;
    const b = worldBounds(asDoc(doc), nodeId);
    if (!b) continue;
    const x = Math.max(0, b.x - origin.x);
    const y = Math.max(0, b.y - origin.y);
    const w = Math.min(origin.width, b.x - origin.x + b.width) - x;
    const h = Math.min(origin.height, b.y - origin.y + b.height) - y;
    if (w <= 0 || h <= 0) continue;
    out.push({ nodeId, rect: { x, y, width: w, height: h }, flow: flows[0], flows });
  }
  return out;
}
