// Document model: maps 1:1 to SVG. See docs/rebuild-spec.md and docs/architecture.md.

export type Id = string;

export interface Vec {
  x: number;
  y: number;
}

export interface GradientStop {
  offset: number; // 0..1
  color: string; // #rrggbb or #rrggbbaa
}

export type Paint =
  | { kind: 'none' }
  | { kind: 'solid'; color: string /* #rrggbb or #rrggbbaa */ }
  | { kind: 'linear' | 'radial'; stops: GradientStop[]; angle?: number /* linear, deg */ };

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface Stroke {
  paint: Paint;
  width: number;
  cap: LineCap;
  join: LineJoin;
  dash: number[];
}

/** Node is drawn at translate(x,y) rotate(rotation) scale(scaleX,scaleY) around its local origin. */
export interface Transform {
  x: number;
  y: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
}

export interface NodeBase {
  id: Id;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Tracing reference: drawn, but never hit-tested, snapped to or exported. Absent = false. */
  reference?: boolean;
  opacity: number; // 0..1
  blendMode?: string;
  transform: Transform;
  /** Wireframe documents only: this top-level group is a screen frame (see src/wireframe). */
  screen?: ScreenFrameInfo;
  /** Wireframe documents only: this group is a component instance; its children are generated. */
  component?: ComponentInfo;
  /** Wireframe documents only: this group lays out its children (stack / grid). Reserved for the layout step. */
  layout?: LayoutInfo;
  /** Wireframe documents only: how this node sits in its parent's `layout`. Reserved for the layout step. */
  layoutItem?: LayoutItemInfo;
}

export type PointType = 'corner' | 'smooth' | 'symmetric';

/** in/out handles are absolute in local coords. */
export interface BezierPoint {
  x: number;
  y: number;
  in?: Vec;
  out?: Vec;
  type: PointType;
}

export interface SubPath {
  points: BezierPoint[];
  closed: boolean;
}

export interface Painted {
  fill: Paint;
  stroke: Stroke;
}

export type GroupNode = NodeBase & { type: 'group'; children: SceneNode[] };
export type PathNode = NodeBase &
  Painted & { type: 'path'; subpaths: SubPath[]; fillRule: 'nonzero' | 'evenodd' };
/** Centered on its local origin: spans -width/2..width/2, -height/2..height/2. */
export type RectNode = NodeBase & Painted & { type: 'rect'; width: number; height: number; radius: number };
/** Centered on its local origin. */
export type EllipseNode = NodeBase & Painted & { type: 'ellipse'; rx: number; ry: number };
/** Centered on its local origin; first vertex points up. Star when innerRadius is set. */
export type PolygonNode = NodeBase &
  Painted & { type: 'polygon'; sides: number; radius: number; innerRadius?: number };
/** Local origin is the anchor of the first line's top edge, at left/center/right per `align`. */
export type TextNode = NodeBase &
  Painted & {
    type: 'text';
    text: string;
    fontFamily: string;
    fontWeight: number;
    fontStyle: 'normal' | 'italic';
    fontSize: number;
    letterSpacing: number;
    lineHeight: number;
    align: 'left' | 'center' | 'right';
  };
/** Centered on its local origin. */
export type ImageNode = NodeBase & { type: 'image'; href: string /* data URL */; width: number; height: number };

export type SceneNode = GroupNode | PathNode | RectNode | EllipseNode | PolygonNode | TextNode | ImageNode;
export type NodeType = SceneNode['type'];
export type PaintedNode = Extract<SceneNode, Painted>;

export interface Artboard {
  width: number;
  height: number;
  background: Paint; // none = transparent
}

export type IconPreset = 'app-icon' | 'android-adaptive' | 'ios' | 'favicon-32' | 'favicon-16';
export type IconShapeSetting = 'auto' | 'circle' | 'square' | 'wide' | 'tall';
/** one-colour: every paint becomes the glyph colour (default). full-colour: the document's own paints are kept. */
export type IconColourMode = 'one-colour' | 'full-colour';

/** Marks an app icon document (keylines, icon panel, icon-set export). See src/icon/. */
export interface IconDocInfo {
  /** app-icon (128 tile), android-adaptive (108 canvas, 72 visible), ios (1024), favicon-32, favicon-16. */
  preset: IconPreset;
  /** Keyline: auto detects square / wide / tall from the ink box; circle only when set. */
  shape: IconShapeSetting;
  /** Project used for the 16/32/48 px favicon glyph (glyph-small.svg) instead of this one. */
  smallGlyphProjectId?: string;
  /** Tile colour `#rrggbb` (default: the hfps blue `#2063b0`; older repos keep olive `#5b7a3a`). */
  tile?: string;
  /** Omitted = one-colour: the whole glyph is `glyph` (default white). full-colour keeps solids, gradients and opacity. */
  colour?: IconColourMode;
  /** One-colour mode: the glyph colour `#rrggbb` (default white `#ffffff`, omitted). Ignored in full-colour mode. */
  glyph?: string;
}

// ---------- wireframe mode (docs/wireframe-mode.md) ----------

/** Device class of a screen frame. Kept deliberately few: no device list, no orientations. */
export type ScreenPlatform = 'phone' | 'tablet' | 'desktop';

/**
 * A screen frame: a top-level group drawn as a device frame (white, thin border, name above).
 * Local origin = the frame's top-left corner; the frame spans 0..width × 0..height and clips its
 * children on export. `height` is materialized: max(platform minimum, content).
 */
export interface ScreenFrameInfo {
  /** The logical screen (`DesignDocument.wireframe.screens[].id`) this frame is a variant of. */
  screenId: Id;
  platform: ScreenPlatform;
  /** Frame width (default: the platform width; editable for an odd case). */
  width: number;
  /** Frame height, written by the wireframe pipeline: never below the platform minimum. */
  height: number;
}

/** A semantic component instance: `build(props, size)` of the library kind generates the group's children. */
export interface ComponentInfo {
  /** Library kind, e.g. `list-row` (src/wireframe/library/<kind>/index.ts). */
  kind: string;
  /** Prop values (missing props take the definition's defaults). */
  props: Record<string, unknown>;
  /** The box the children were built for (local origin = top-left). Omitted = the definition's default size. */
  size?: { width: number; height: number };
}

export type LayoutKind = 'vstack' | 'hstack' | 'grid';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';

/** Container layout (reserved: the layout step fills in the behaviour). */
export interface LayoutInfo {
  kind: LayoutKind;
  /** Space between children. */
  gap: number;
  /** Inner padding on every side. */
  padding: number;
  /** Cross-axis alignment of the children. */
  align: LayoutAlign;
  /** Grid only: number of columns. */
  columns?: number;
}

/** `fill` the available space, `hug` the content, or a fixed size. */
export type LayoutSize = 'fill' | 'hug' | number;

/** A child's sizing inside a layout container (reserved for the layout step). */
export interface LayoutItemInfo {
  width?: LayoutSize;
  height?: LayoutSize;
  /** `flow` (default): placed by the stack. `pinned-bottom`: at the bottom of the screen. `free`: absolute, ignored by the stack. */
  position?: 'flow' | 'pinned-bottom' | 'free';
}

/** A logical screen (`Settings`, `Gallery`): one or more frames, at most one per platform. */
export interface WireframeScreen {
  id: Id;
  name: string;
}

/** Marks a wireframe document: infinite canvas (the artboard is unused), screens, components. */
export interface WireframeDocInfo {
  /** Logical screens, in creation order. Kept in sync with the frames by the wireframe pipeline. */
  screens: WireframeScreen[];
}

export interface DesignDocument {
  schemaVersion: 1;
  id: Id;
  name: string;
  createdAt: number;
  updatedAt: number;
  artboard: Artboard;
  children: SceneNode[];
  /** Present only on app icon documents. */
  icon?: IconDocInfo;
  /** Present only on wireframe documents. */
  wireframe?: WireframeDocInfo;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const isPainted = (n: SceneNode): n is PaintedNode => 'fill' in n && 'stroke' in n;
export const isGroup = (n: SceneNode): n is GroupNode => n.type === 'group';
