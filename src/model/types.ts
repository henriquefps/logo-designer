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
  /** Wireframe documents only: this group lays out its children (stack / grid, src/wireframe/layout.ts). */
  layout?: LayoutInfo;
  /** Wireframe documents only: how this node sits in its parent's `layout`. */
  layoutItem?: LayoutItemInfo;
  /** Wireframe documents only: this top-level group is a note (a sticky, optionally attached to a node). */
  note?: NoteInfo;
  /**
   * Wireframe documents only: this node is a generated copy of the first child of its parent's
   * `layout.repeat` (read-only; the pipeline rewrites it from the template). Set on the copy's root only.
   */
  repeatCopy?: RepeatCopyInfo;
  /**
   * Wireframe documents only: this group is an instance of a shared component (a master in
   * `wireframe.symbols`). Its content is a linked copy of the master's: editing it inside any
   * instance updates the master and every other instance (src/wireframe/symbols.ts).
   */
  symbol?: SymbolRef;
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

/** Container layout (src/wireframe/layout.ts). The container's local origin is its top-left corner. */
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
  /**
   * The container's box (local origin = top-left), written by the layout step. Screen frames keep
   * theirs in `screen` instead. Omitted = not laid out yet (the layout step measures the content).
   */
  size?: { width: number; height: number };
  /** Lo-fi look of a stack / grid (not screen frames): omitted = `none` (invisible). */
  style?: ContainerStyle;
  /** Corner radius of a styled container (style tokens): omitted = `none` (square). */
  radius?: ContainerRadius;
  /**
   * Repeat the first child (the template) `count` times: the pipeline generates `count − 1` read-only
   * copies after it (`repeatCopy`). The container's gap is the space between the items.
   */
  repeat?: { count: number };
}

/** `outline` = 1 px border, `filled` = light grey, `outline-filled` = both. No colours. */
export type ContainerStyle = 'none' | 'outline' | 'filled' | 'outline-filled';
/** `small` / `large` corners from the wireframe style tokens. */
export type ContainerRadius = 'none' | 'small' | 'large';

/** Marks a generated repeat copy (see `LayoutInfo.repeat`). */
export interface RepeatCopyInfo {
  /** Id of the template (the container's first child) this is a copy of. */
  template: Id;
  /** Position of the copy in the list: 2…count (the template is 1). */
  index: number;
}

/** `fill` the available space, `hug` the content, or a fixed size. */
export type LayoutSize = 'fill' | 'hug' | number;

/** A child's sizing inside a layout container. Missing fields take the defaults (component `sizing`, containers fill × hug). */
export interface LayoutItemInfo {
  width?: LayoutSize;
  height?: LayoutSize;
  /** `flow` (default): placed by the stack. `pinned-bottom`: at the bottom of the screen. `free`: absolute, ignored by the stack. */
  position?: 'flow' | 'pinned-bottom' | 'free';
  /**
   * Edge to edge: the child ignores the parent's padding on the cross axis (horizontal padding in a
   * vertical stack, vertical in a horizontal one; no effect in a grid). Default: the component's `sizing.bleed`.
   */
  bleed?: boolean;
}

/**
 * A note: a sticky on the canvas (a top-level group; its children are generated from `text`),
 * optionally attached to a node (`target`: any node id) by a connector line that follows both.
 * Notes are not part of screen exports; they are part of the export for AI.
 */
export interface NoteInfo {
  text: string;
  /** The node this note is attached to. Absent = a free note. Cleared when that node is deleted. */
  target?: Id;
}

/** How a logical screen relates to the app that exists today (docs/wireframe-mode.md → Screen status). */
export type ScreenStatus = 'current' | 'changed' | 'new';

/** A logical screen (`Settings`, `Gallery`): one or more frames, at most one per platform. */
export interface WireframeScreen {
  id: Id;
  name: string;
  /** Unset = not stated. Shown as a badge on the frame label and in the export for AI. */
  status?: ScreenStatus;
}

/**
 * A flow arrow: tapping `from` (any node inside a screen frame) opens the logical screen `to`.
 * Drawn as a canvas overlay (never in screen exports); removed with its source node or target screen.
 */
export interface WireframeFlow {
  id: Id;
  /** The source element (a node inside a frame; a component instance, not one of its generated children). */
  from: Id;
  /** The target logical screen (`wireframe.screens[].id`). */
  to: Id;
  label?: string;
}

/** Points an instance at its shared component (`wireframe.symbols[].id`). */
export interface SymbolRef {
  id: Id;
}

/**
 * A shared component (user component, phase 2): a piece the user built from a group or container,
 * used on several screens. The master lives here, not on the canvas; instances are groups with
 * `symbol: { id }` whose children are materialized copies of `content.children`.
 */
export interface WireframeSymbol {
  id: Id;
  /** Shown in the library ("My components") and in the export for AI ("Shared: Trip card"). */
  name: string;
  /**
   * The master: a group in the master's own id space (instance nodes carry `<instance id>~s~<id>`).
   * Its `layout` (minus `size`) and `children` are shared; `layout.size` and `layoutItem` are only
   * the defaults a new instance starts with. Nested instances are stored without children.
   */
  content: GroupNode;
}

/** Marks a wireframe document: infinite canvas (the artboard is unused), screens, components. */
export interface WireframeDocInfo {
  /** Logical screens, in creation order. Kept in sync with the frames by the wireframe pipeline. */
  screens: WireframeScreen[];
  /** Flow arrows (phase 2). Absent = none. */
  flows?: WireframeFlow[];
  /** Shared components (masters), phase 2. Absent = none. */
  symbols?: WireframeSymbol[];
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
