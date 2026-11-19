// Screen frames of wireframe documents (docs/wireframe-mode.md). Pure geometry the model needs
// (bounds, hit testing, scale baking); the behaviour lives in src/wireframe.
import type { DesignDocument, GroupNode, Rect, ScreenPlatform, SceneNode } from './types';
import { findNode } from './tree';

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

/** The intrinsic box of a sized group (screen frame or component instance) in local space, else null. */
export function sizedGroupBox(n: SceneNode): Rect | null {
  if (n.type !== 'group') return null;
  if (n.screen) return { x: 0, y: 0, width: n.screen.width, height: n.screen.height };
  // A component instance is the box it was built for (its selection box and its hit area).
  if (n.component?.size) return { x: 0, y: 0, width: n.component.size.width, height: n.component.size.height };
  return null;
}

// ---------- per-node editing traits (generic hooks; notes and component instances opt out) ----------

/** False for nodes whose size is not the user's to change (notes: fixed width, auto height): no resize/rotate handles, no W/H/rotation/flip fields. */
export const canResizeNode = (n: SceneNode): boolean => !(n.type === 'group' && !!n.note);

/** False for nodes that are not styled by the user (notes, component instances): the fill/stroke swatches skip them and Properties hides Appearance / Fill / Stroke. */
export const isUserPaintable = (n: SceneNode): boolean => !(n.type === 'group' && (!!n.note || !!n.component));

/** False for nodes that are never rotated or flipped (notes, component instances: they are resized, which rebuilds them): no rotate handle, no rotation/flip fields. */
export const canRotateNode = (n: SceneNode): boolean => canResizeNode(n) && !(n.type === 'group' && !!n.component);

/** Whether every node of the selection can be rotated/flipped. */
export const canRotateSelection = (doc: DesignDocument, ids: readonly string[]): boolean =>
  ids.every((id) => {
    const n = findNode(doc, id);
    return !n || canRotateNode(n);
  });

/** Whether every node of the selection can be resized/rotated. */
export const canResizeSelection = (doc: DesignDocument, ids: readonly string[]): boolean =>
  ids.every((id) => {
    const n = findNode(doc, id);
    return !n || canResizeNode(n);
  });
