import { setTextMeasurer, type TextNode } from '@/model';
import { autoOpsz, layoutText, lineWidthFrom, type FaceChoice, type TextLayout } from './layout';
import { coordsFor, type LoadedFont } from './parse';
import { loadedFont, requestFace, resolveText, type ResolvedText } from './store';

/** Line width in document units using the real font (same math as the outliner). */
export function fontLineWidth(font: LoadedFont, line: string, node: TextNode, r: Pick<FaceChoice, 'weight' | 'face'>): number {
  const s = node.fontSize / font.ot.unitsPerEm;
  const coords = coordsFor(font, r.weight, autoOpsz(r.face, node.fontSize));
  const glyphs = Array.from(line, (ch) => font.glyphFor(ch));
  return lineWidthFrom(
    glyphs.length,
    (i) => font.advance(glyphs[i], coords) * s,
    (i) => font.kerning(glyphs[i], glyphs[i + 1]) * s,
    node.letterSpacing,
  );
}

const approxWidth = (line: string, node: TextNode) => {
  const n = Array.from(line).length;
  return n * node.fontSize * 0.56 + Math.max(0, n - 1) * node.letterSpacing;
};

/** Layout of a text node with the best metrics available now (requests the font if needed). */
export function textLayout(node: TextNode): TextLayout & { resolved: ResolvedText; exact: boolean } {
  const resolved = resolveText(node);
  const font = loadedFont(resolved.face.key);
  if (!font) requestFace(resolved.face.key);
  const layout = layoutText(node, resolved.face.metrics, (line) => (font ? fontLineWidth(font, line, node, resolved) : approxWidth(line, node)));
  return { ...layout, resolved, exact: !!font };
}

let installed = false;
export function installMeasurer() {
  if (installed) return;
  installed = true;
  setTextMeasurer((node) => {
    const l = textLayout(node);
    return { width: l.width, height: l.height, lineWidths: l.lines.map((x) => x.width) };
  });
}
