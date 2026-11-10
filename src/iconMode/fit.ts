// "Fit to keyline": scales and centres the glyph on the canvas exactly as build-icons.mjs will
// (ink box centred in the tile, long side = keyline · T), so the canvas matches the output.
import { faviconFill, fit, docToGlyphSpace, iconTile, isFaviconPreset, KEYLINE, shapeOf, type InkBox } from '@/icon';
import { applyWorldMatrix, IDENTITY, invert, isPainted, multiply, type DesignDocument, type Matrix, type SceneNode } from '@/model';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Keyline fill (fraction of T) the script uses for this document's glyph. */
export function keylineFill(doc: DesignDocument, box: InkBox): number {
  const preset = doc.icon?.preset ?? 'app-icon';
  const shape = shapeOf(box, doc.icon?.shape ?? 'auto');
  // Favicon documents hold the small glyph (--small): it is fitted at SMALL_FILL.
  return isFaviconPreset(preset) ? faviconFill(shape, true) : KEYLINE[shape].long;
}

/** World (document) matrix that moves the measured glyph onto its keyline. */
export function keylineMatrix(doc: DesignDocument, box: InkBox): { m: Matrix; s: number } {
  const g = docToGlyphSpace(iconTile(doc.icon?.preset ?? 'app-icon', doc.artboard));
  const G: Matrix = { a: g.k, b: 0, c: 0, d: g.k, e: g.e, f: g.f };
  const f = fit(box, 128, keylineFill(doc, box));
  const F: Matrix = { a: f.s, b: 0, c: 0, d: f.s, e: f.tx, f: f.ty };
  return { m: multiply(invert(G), multiply(F, G)), s: f.s };
}

/**
 * The glyph's top-level objects with the fit applied (visible, unlocked, non-reference). Strokes
 * scale with the glyph, as the script's `scale()` does: baked shapes get their stroke width scaled.
 */
export function fittedNodes(doc: DesignDocument, box: InkBox): SceneNode[] {
  const { m, s } = keylineMatrix(doc, box);
  return doc.children
    .filter((n) => n.visible && !n.reference && !n.locked)
    .map((n) => {
      const out = applyWorldMatrix(n, IDENTITY, m);
      // Groups (and shapes that keep a scale) scale their strokes through the transform already.
      const baked = out.type !== 'group' && near(Math.abs(out.transform.scaleX), Math.abs(n.transform.scaleX));
      if (baked && isPainted(out)) out.stroke = { ...out.stroke, width: out.stroke.width * s, dash: out.stroke.dash.map((d) => d * s) };
      return out;
    });
}

/** True when the glyph already sits on its keyline (within 0.002 T and 0.002 T of centre). */
export function isOnKeyline(doc: DesignDocument, box: InkBox): boolean {
  const fill = keylineFill(doc, box);
  const long = Math.max(box.w, box.h) / 128;
  const cx = (box.x + box.w / 2) / 128;
  const cy = (box.y + box.h / 2) / 128;
  // 1/2048 · 256 = 0.125 units of measurement quantization ≈ 0.001 T.
  return Math.abs(long - fill) < 0.003 && Math.abs(cx - 0.5) < 0.003 && Math.abs(cy - 0.5) < 0.003;
}
