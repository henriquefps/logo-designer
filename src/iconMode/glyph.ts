// The glyph of an icon document as build-icons.mjs expects it: an SVG fragment in a 128 × 128
// space (the visible tile mapped to 0..128) painted with currentColor (alpha kept).
import { iconTile, docToGlyphSpace } from '@/icon';
import type { DesignDocument } from '@/model';
import { bakeTransforms } from '@/io/bakeTransforms';
import { exportSvg } from '@/io/svgExport';

/** 6 decimals: the tile → 128 map must not drift (e.g. 128 / 72 on Android). */
const n6 = (v: number) => String(Math.round(v * 1e6) / 1e6 || 0);

/** Fragment body of an exported SVG (children of the root, dedented). Empty when nothing is drawn. */
function svgBody(svg: string): string {
  const open = svg.indexOf('>');
  if (svg.slice(0, open + 1).endsWith('/>')) return '';
  const close = svg.lastIndexOf('</svg>');
  return svg
    .slice(open + 1, close)
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
    .join('\n');
}

/** The square mapped onto 0..128: the visible tile, or (not an icon document) the artboard's longest side, centred. */
function glyphTile(doc: DesignDocument) {
  if (doc.icon) return iconTile(doc.icon.preset, doc.artboard);
  const side = Math.max(doc.artboard.width, doc.artboard.height);
  return { x: (doc.artboard.width - side) / 2, y: (doc.artboard.height - side) / 2, size: side };
}

/** glyph.svg for build-icons.mjs: hidden and reference objects skipped, text outlined. */
export async function glyphFragment(doc: DesignDocument): Promise<string> {
  const { svg } = await exportSvg(await bakeTransforms(doc), { scope: 'artboard', background: false, currentColor: true });
  const body = svgBody(svg);
  if (!body) return '';
  const { k, e, f } = docToGlyphSpace(glyphTile(doc));
  const identity = Math.abs(k - 1) < 1e-9 && Math.abs(e) < 1e-9 && Math.abs(f) < 1e-9;
  if (identity) return body + '\n';
  const inner = body
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n');
  return `<g transform="matrix(${n6(k)} 0 0 ${n6(k)} ${n6(e)} ${n6(f)})">\n${inner}\n</g>\n`;
}
