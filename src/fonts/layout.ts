import type { TextNode } from '@/model';
import type { FontFaceInfo, FontMetrics, FontStyle, WeightRange } from './types';

/**
 * Pure text layout shared by the canvas renderer, the measurer and the outliner, so live text,
 * selection boxes and outlines line up. Lines start at y = i * lineHeight * fontSize; the baseline
 * sits where CSS puts it in a line box (half-leading above the content area).
 */

export interface LineLayout {
  text: string;
  /** Left edge of the line in node-local coords (depends on align). */
  x: number;
  /** Baseline y in node-local coords. */
  baseline: number;
  width: number;
}

export interface TextLayout {
  lines: LineLayout[];
  width: number;
  height: number;
}

/** Distance from a line box's top to its baseline. */
export function baselineOffset(metrics: FontMetrics, fontSize: number, lineHeight: number): number {
  const s = fontSize / metrics.unitsPerEm;
  const content = (metrics.ascender - metrics.descender) * s;
  const lh = fontSize * lineHeight;
  return (lh - content) / 2 + metrics.ascender * s;
}

export const splitLines = (text: string) => text.split('\n');

/** Letter spacing is added between characters (not after the last one). */
export function layoutText(
  node: Pick<TextNode, 'text' | 'fontSize' | 'lineHeight' | 'align'>,
  metrics: FontMetrics,
  lineWidth: (line: string) => number,
): TextLayout {
  const lh = node.fontSize * node.lineHeight;
  const base = baselineOffset(metrics, node.fontSize, node.lineHeight);
  const lines = splitLines(node.text).map((text, i) => {
    const width = text ? lineWidth(text) : 0;
    const x = node.align === 'left' ? 0 : node.align === 'center' ? -width / 2 : -width;
    return { text, x, baseline: i * lh + base, width };
  });
  return { lines, width: Math.max(0, ...lines.map((l) => l.width)), height: lines.length * lh };
}

/** Width of a line from per-character advances (+ kerning between pairs) and letter spacing. */
export function lineWidthFrom(count: number, advance: (i: number) => number, kern: (i: number) => number, letterSpacing: number): number {
  let w = 0;
  for (let i = 0; i < count; i++) {
    w += advance(i);
    if (i < count - 1) w += kern(i) + letterSpacing;
  }
  return w;
}

const dist = (r: WeightRange, w: number) => (w < r[0] ? r[0] - w : w > r[1] ? w - r[1] : 0);

/**
 * CSS Fonts 4 weight matching between faces of one style: a face covering the weight wins;
 * otherwise 400–500 look up to 500, then down, then up; below 400 look down then up; above 500 look up then down.
 */
export function matchWeight<T extends { weight: WeightRange }>(faces: T[], desired: number): T | null {
  if (!faces.length) return null;
  const inside = faces.find((f) => dist(f.weight, desired) === 0);
  if (inside) return inside;
  const below = faces.filter((f) => f.weight[1] < desired).sort((a, b) => b.weight[1] - a.weight[1]);
  const above = faces.filter((f) => f.weight[0] > desired).sort((a, b) => a.weight[0] - b.weight[0]);
  if (desired >= 400 && desired <= 500) {
    const upTo500 = above.filter((f) => f.weight[0] <= 500);
    return upTo500[0] ?? below[0] ?? above[0] ?? null;
  }
  if (desired < 400) return below[0] ?? above[0] ?? null;
  return above[0] ?? below[0] ?? null;
}

export interface FaceChoice {
  face: FontFaceInfo;
  /** Weight to render with (clamped into the face's range). */
  weight: number;
  /** Italic requested but the family has no italic face: skew it ourselves. */
  syntheticItalic: boolean;
}

/** Picks the face for weight/style like a browser would (with font-synthesis turned off). */
export function chooseFace(faces: FontFaceInfo[], weight: number, style: FontStyle): FaceChoice | null {
  const same = faces.filter((f) => f.style === style);
  const pool = same.length ? same : faces;
  const face = matchWeight(pool, weight);
  if (!face) return null;
  return {
    face,
    weight: Math.min(face.weight[1], Math.max(face.weight[0], weight)),
    syntheticItalic: style === 'italic' && face.style !== 'italic',
  };
}

/** Value for the opsz axis that browsers pick automatically (font-optical-sizing: auto). */
export function autoOpsz(face: FontFaceInfo, fontSize: number): number | undefined {
  if (!face.opsz) return undefined;
  return Math.min(face.opsz[1], Math.max(face.opsz[0], fontSize));
}
