// SVG markup → a whole DesignDocument (artboard from the viewBox). Pure: needs only DOMParser, so
// the app ("Open SVG as new project", open links) and the `designer` CLI share it.
import { boundsIn, createDocument, fromTransform, unionRects, type DesignDocument } from '@/model';
import { parseSvg } from './svgImport';

export interface SvgDocumentResult {
  doc: DesignDocument;
  warnings: string[];
}

/** Parses SVG into a new document named `name`. Throws a readable error when it is not SVG. */
export function svgToDocument(text: string, name: string): SvgDocumentResult {
  const result = parseSvg(text);
  let { width, height } = result;
  const children = result.nodes;
  if (!(width > 0) || !(height > 0)) {
    // No viewBox/size: fit the artboard to the content.
    const b = unionRects(children.map((n) => boundsIn(n, fromTransform(n.transform))));
    width = Math.max(1, Math.ceil(b ? b.x + b.width : 1024));
    height = Math.max(1, Math.ceil(b ? b.y + b.height : 1024));
  }
  const doc = createDocument({ name, artboard: { width, height, background: { kind: 'none' } }, children });
  return { doc, warnings: result.warnings };
}
