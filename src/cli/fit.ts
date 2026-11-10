// Keyline fitting for the CLI: the same transform as the app's "Fit to keyline" (src/iconMode/fit.ts),
// measured through the same path as `designer icons` (glyph fragment → resvg raster → ink box).
import { inkBox, MEASURE_PX } from '@/icon';
import type { InkBox } from '@/icon';
import { resvgRasterize } from '@/icon/resvgRenderer';
import { exportGlyph } from '@/io/glyphExport';
import type { DesignDocument } from '@/model';
import { fittedNodes, isOnKeyline, keylineFill } from '@/iconMode/fit';

export interface KeylineState {
  /** Long side of the ink as a fraction of the tile (T). */
  long: number;
  /** Fraction of T the keyline asks for. */
  target: number;
  onKeyline: boolean;
}

/** Measures the glyph's ink box exactly as `designer icons` does; null when there is no visible ink. */
export async function measureInk(doc: DesignDocument): Promise<InkBox | null> {
  const glyph = await exportGlyph(doc);
  return glyph ? inkBox(glyph, resvgRasterize, MEASURE_PX) : null;
}

export function keylineState(doc: DesignDocument, box: InkBox): KeylineState {
  return { long: Math.max(box.w, box.h) / 128, target: keylineFill(doc, box), onKeyline: isOnKeyline(doc, box) };
}

/** Keyline state of an app icon document, or null (not an icon, or nothing drawn). */
export async function keylineOf(doc: DesignDocument): Promise<KeylineState | null> {
  if (!doc.icon) return null;
  const box = await measureInk(doc);
  return box ? keylineState(doc, box) : null;
}

/** The document with its glyph scaled and centred on the keyline (strokes scale too). */
export async function fitDocument(doc: DesignDocument): Promise<{ doc: DesignDocument; before: KeylineState; after: KeylineState }> {
  if (!doc.icon) throw new Error('not an app icon project (create one with `designer new --preset app-icon` or from-svg --icon)');
  const box = await measureInk(doc);
  if (!box) throw new Error('there is no visible ink to fit: draw a glyph first');
  const before = keylineState(doc, box);
  const byId = new Map(fittedNodes(doc, box).map((n) => [n.id, n]));
  const fitted: DesignDocument = { ...doc, children: doc.children.map((n) => byId.get(n.id) ?? n) };
  const after = (await keylineOf(fitted))!;
  return { doc: fitted, before, after };
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
export const describeKeyline = (k: KeylineState) => `long side ${pct(k.long)} of T (keyline ${pct(k.target)}), on keyline: ${k.onKeyline ? 'yes' : 'no'}`;
