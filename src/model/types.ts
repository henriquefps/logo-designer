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

/** Marks an app icon document (keylines, icon panel, icon-set export). See src/icon/. */
export interface IconDocInfo {
  /** app-icon (128 tile), android-adaptive (108 canvas, 72 visible), ios (1024), favicon-32, favicon-16. */
  preset: IconPreset;
  /** Keyline: auto detects square / wide / tall from the ink box; circle only when set. */
  shape: IconShapeSetting;
  /** Project used for the 16/32/48 px favicon glyph (glyph-small.svg) instead of this one. */
  smallGlyphProjectId?: string;
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
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const isPainted = (n: SceneNode): n is PaintedNode => 'fill' in n && 'stroke' in n;
export const isGroup = (n: SceneNode): n is GroupNode => n.type === 'group';
