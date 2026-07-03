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
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  /** For 'line', signed (direction from start to end); always positive for rectangle/ellipse/path. */
  width: number;
  height: number;
  /** null = no fill. Always null for 'line' and 'path' (drawn as open strokes). */
  fill: string | null;
  stroke: string;
  strokeWidth: number;
  /** rectangle only */
  cornerRadius?: number;
  /** path only — points relative to the element's center (x, y) */
  points?: ShapePoint[];
}

export type LogoElement = IconElement | TextElement | ImageElement | ShapeElement;

export type ElementType = LogoElement['type'];
