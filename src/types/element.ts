export type IconLibrary = 'lucide' | 'phosphor';

interface BaseElement {
  id: string;
  x: number;
  y: number;
  rotation: number;
  /** 0-100 */
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  locked: boolean;
  label?: string;
}

export interface IconElement extends BaseElement {
  type: 'icon';
  iconType: IconLibrary;
  name: string;
  size: number;
  color: string;
  /** lucide only */
  strokeWidth?: number;
  /** phosphor only */
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  size: number;
  color: string;
  fontFamily: string;
  fontWeight: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  size: number;
  naturalWidth: number;
  naturalHeight: number;
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'line' | 'path';

export interface ShapePoint {
  x: number;
  y: number;
  /**
   * Bézier control handles, relative to (x, y) — `handleOut` points toward the *next* anchor's
   * segment, `handleIn` toward the *previous* one. Omitting a side means a straight ("corner")
   * segment on that side, which is exactly what every point produced by the freehand pen tool
   * looks like today — so existing saved shapes remain valid ShapePoint[] with no migration.
   */
  handleInX?: number;
  handleInY?: number;
  handleOutX?: number;
  handleOutY?: number;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  /** For 'line', signed (direction from start to end); always positive for rectangle/ellipse/path. */
  width: number;
  height: number;
  /** null = no fill. Always null for 'line'; for 'path', null unless it's a boolean-op result (a
   * closed region, which can be filled) — an open freehand/pen-tool stroke stays null. */
  fill: string | null;
  stroke: string;
  strokeWidth: number;
  /** rectangle only */
  cornerRadius?: number;
  /** path only — points relative to the element's center (x, y). Ignored when `pathData` is set. */
  points?: ShapePoint[];
  /** path only — whether the last point connects back to the first (drawn as a real closing
   * segment, curved if either end has a handle there). Freehand pen-tool paths are always open
   * (undefined); rectangle/ellipse converted via "convert to path" are always closed. */
  closed?: boolean;
  /** path only — raw absolute SVG path data (relative to the element's own x/y origin) from a
   * boolean op. Takes precedence over `points`: unlike `points`, it can express multiple subpaths
   * (e.g. a ring's hole), which a single ShapePoint[] list can't represent. Not node-editable. */
  pathData?: string;
}

export type LogoElement = IconElement | TextElement | ImageElement | ShapeElement;

export type ElementType = LogoElement['type'];
