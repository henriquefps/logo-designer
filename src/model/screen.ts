// Screen frames of wireframe documents (docs/wireframe-mode.md). Pure geometry the model needs
// (bounds, hit testing, scale baking); the behaviour lives in src/wireframe.
import type { DesignDocument, GroupNode, Rect, ScreenPlatform, SceneNode } from './types';
import { findNode, locate } from './tree';

export interface PlatformDef {
  id: ScreenPlatform;
  label: string;
  width: number;
  /** The frame never gets shorter than this; it grows with the content. */
  minHeight: number;
}

/** Decided in docs/wireframe-mode.md: three platforms, no device list, no orientations. */
export const SCREEN_PLATFORMS: readonly PlatformDef[] = [
  { id: 'phone', label: 'Phone', width: 390, minHeight: 844 },
  { id: 'tablet', label: 'Tablet', width: 820, minHeight: 1180 },
  { id: 'desktop', label: 'Desktop', width: 1440, minHeight: 900 },
];

export const PLATFORM_IDS = SCREEN_PLATFORMS.map((p) => p.id);

export const platformDef = (id: ScreenPlatform): PlatformDef => SCREEN_PLATFORMS.find((p) => p.id === id) ?? SCREEN_PLATFORMS[0];

export type ScreenNode = GroupNode & { screen: NonNullable<GroupNode['screen']> };
export type ComponentNode = GroupNode & { component: NonNullable<GroupNode['component']> };

/** A screen frame (a group carrying `screen`). Only top-level ones count, see `screenNodes`. */
export const isScreenNode = (n: SceneNode): n is ScreenNode => n.type === 'group' && !!n.screen;
export const isComponentNode = (n: SceneNode): n is ComponentNode => n.type === 'group' && !!n.component;

/** Screen frames of a wireframe document (top-level groups with `screen`), in document order. */
export function screenNodes(doc: Pick<DesignDocument, 'children' | 'wireframe'>): ScreenNode[] {
  return doc.wireframe ? doc.children.filter(isScreenNode) : [];
}

/** The frame's box in its own local space (origin = top-left corner). */
export const screenLocalRect = (n: ScreenNode): Rect => ({ x: 0, y: 0, width: n.screen.width, height: n.screen.height });

/** A layout container (stack / grid) that is not a screen frame. */
export const isContainerNode = (n: SceneNode): n is GroupNode & { layout: NonNullable<GroupNode['layout']> } => n.type === 'group' && !!n.layout && !n.screen;

/** The intrinsic box of a sized group (screen frame or laid-out container) in local space, else null. */
export function sizedGroupBox(n: SceneNode): Rect | null {
  if (n.type !== 'group') return null;
  if (n.screen) return { x: 0, y: 0, width: n.screen.width, height: n.screen.height };
  // A component instance is the box it was built for (its selection box and its hit area).
  if (n.component?.size) return { x: 0, y: 0, width: n.component.size.width, height: n.component.size.height };
  if (n.layout?.size) return { x: 0, y: 0, width: n.layout.size.width, height: n.layout.size.height };
  return null;
}

// ---------- per-node editing traits (generic hooks; notes and component instances opt out) ----------

export type Axis = 'width' | 'height';
export interface ResizableAxes {
  width: boolean;
  height: boolean;
}

// The wireframe library tells which axes a component kind can be sized in (src/wireframe/library/registry.ts
// registers this); the model stays free of library imports. Unknown kinds: both.
let componentAxes: (kind: string) => ResizableAxes | undefined = () => undefined;
export const setComponentAxesResolver = (f: (kind: string) => ResizableAxes | undefined) => void (componentAxes = f);

/** The axes the user can size a node in: notes none, component instances what their definition declares, everything else both. */
export function nodeAxes(n: SceneNode): ResizableAxes {
  if (n.type !== 'group') return { width: true, height: true };
  if (n.note) return { width: false, height: false };
  if (n.component) return componentAxes(n.component.kind) ?? { width: true, height: true };
  return { width: true, height: true };
}

/** False for nodes whose size is not the user's to change (notes: fixed width, auto height): no resize/rotate handles, no W/H/rotation/flip fields. */
export const canResizeNode = (n: SceneNode): boolean => !(n.type === 'group' && !!n.note);

/** Axes every node of the selection can be sized in. */
export function selectionAxes(doc: DesignDocument, ids: readonly string[]): ResizableAxes {
  const out = { width: true, height: true };
  for (const id of ids) {
    const n = findNode(doc, id);
    if (!n) continue;
    const a = nodeAxes(n);
    out.width &&= a.width;
    out.height &&= a.height;
  }
  return out;
}

/** A stack / grid of a wireframe (a group with `layout` that is neither a screen frame nor an instance). */
const isStack = (n: SceneNode): boolean => n.type === 'group' && !!n.layout && !n.screen && !n.component;

/** False for nodes that are not styled by the user (notes, component instances, stacks / grids): the fill/stroke swatches skip them and Properties hides Appearance / Fill / Stroke. */
export const isUserPaintable = (n: SceneNode): boolean => !(n.type === 'group' && (!!n.note || !!n.component)) && !isStack(n);

/** False for nodes that are never rotated or flipped (notes, component instances: they are resized, which rebuilds them; stacks / grids): no rotate handle, no rotation/flip fields. */
export const canRotateNode = (n: SceneNode): boolean => canResizeNode(n) && !(n.type === 'group' && !!n.component) && !isStack(n);

/** A child placed by its parent's stack / grid (not `free`): the layout owns its transform, so it is never rotated. */
export function isInLayoutFlow(doc: DesignDocument, id: string): boolean {
  const loc = locate(doc, id);
  if (!loc || loc.parent === doc) return false;
  const p = loc.parent as GroupNode;
  return !!p.layout && !p.component && loc.node.layoutItem?.position !== 'free';
}

/** Whether every node of the selection can be rotated/flipped. */
export const canRotateSelection = (doc: DesignDocument, ids: readonly string[]): boolean =>
  ids.every((id) => {
    const n = findNode(doc, id);
    return !n || (canRotateNode(n) && !(doc.wireframe && isInLayoutFlow(doc, id)));
  });

/** Whether every node of the selection can be resized/rotated. */
export const canResizeSelection = (doc: DesignDocument, ids: readonly string[]): boolean =>
  ids.every((id) => {
    const n = findNode(doc, id);
    return !n || canResizeNode(n);
  });
