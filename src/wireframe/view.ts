// The infinite canvas of wireframe documents: the artboard is not drawn and not used; what the
// view fits, places new objects at and aligns to comes from the content instead.
import type { DesignDocument, Rect } from '@/model';
import { contentRect } from './screens';

/** An empty wireframe fits a phone-sized area at the origin. */
const EMPTY_WIREFRAME: Rect = { x: 0, y: 0, width: 390, height: 844 };

/** What "fit to view" (Cmd+0, opening a document) shows: the artboard, or a wireframe's content. */
export function fitTarget(doc: DesignDocument): Rect {
  if (!doc.wireframe) return { x: 0, y: 0, width: doc.artboard.width, height: doc.artboard.height };
  return contentRect(doc) ?? EMPTY_WIREFRAME;
}

export const isWireframe = (doc: Pick<DesignDocument, 'wireframe'>) => !!doc.wireframe;
