/** Vertical metrics in font units (what browsers use for the line box: hhea, or OS/2 typo with USE_TYPO_METRICS). */
export interface FontMetrics {
  unitsPerEm: number;
  ascender: number;
  /** Negative below the baseline. */
  descender: number;
}

/** A weight range [min, max]; static faces have min === max. */
export type WeightRange = [number, number];

export type FontStyle = 'normal' | 'italic';

/** One font file: a family has one or more faces (weights/styles). */
export interface FontFaceInfo {
  /** Stable key: `bundled:<slug>` or `upload:<id>`. */
  key: string;
  family: string;
  weight: WeightRange;
  style: FontStyle;
  metrics: FontMetrics;
  /** Font has an `opsz` axis [min, max] (browsers apply it automatically from the font size). */
  opsz?: [number, number];
}

export interface FontFamilyInfo {
  family: string;
  source: 'bundled' | 'upload';
  category?: 'sans' | 'serif' | 'display' | 'script' | 'mono';
  faces: FontFaceInfo[];
}

/** Synthetic oblique angle (degrees) used when italic is requested and the family has no italic face. */
export const SYNTHETIC_ITALIC_DEG = 12;
export const SYNTHETIC_ITALIC_SKEW = Math.tan((SYNTHETIC_ITALIC_DEG * Math.PI) / 180);

/** Family used when a node's font is missing. */
export const FALLBACK_FAMILY = 'Inter';
