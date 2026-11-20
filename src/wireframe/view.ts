// The infinite canvas of wireframe documents: the artboard is not drawn and not used; what the
// view fits, places new objects at and aligns to comes from the content instead.
import type { DesignDocument, Rect, Vec } from '@/model';
import { canvasArrowOptions, canvasLabelBand, flowLayout } from './flows';
import { connectorPoints, notesOf } from './notes';
import { contentRect } from './screens';

/** The zoom the overlay's routes are estimated at for fitting (a whole project usually fits around half size). */
const FIT_ZOOM = 0.5;
/** Room kept around a route that leaves the frames (its arrowhead, its label). */
const ROUTE_PAD = 24;

/** An empty wireframe fits a phone-sized area at the origin. */
const EMPTY_WIREFRAME: Rect = { x: 0, y: 0, width: 390, height: 844 };

/** What "fit to view" (Cmd+0, opening a document) shows: the artboard, or a wireframe's content with its arrows. */
export function fitTarget(doc: DesignDocument): Rect {
  if (!doc.wireframe) return { x: 0, y: 0, width: doc.artboard.width, height: doc.artboard.height };
  const r = contentRect(doc);
  if (!r) return EMPTY_WIREFRAME;
  // Flow arrows and note connectors may run on lanes above or below every frame: they are part of the picture.
  const pts: Vec[] = flowLayout(doc, canvasArrowOptions(FIT_ZOOM)).arrows.flatMap((a) => a.route.points);
  for (const n of notesOf(doc)) pts.push(...(connectorPoints(doc, n, { band: canvasLabelBand(FIT_ZOOM) }) ?? []));
  if (!pts.length) return r;
  const x0 = Math.min(r.x, ...pts.map((p) => p.x - ROUTE_PAD));
  const y0 = Math.min(r.y, ...pts.map((p) => p.y - ROUTE_PAD));
  const x1 = Math.max(r.x + r.width, ...pts.map((p) => p.x + ROUTE_PAD));
  const y1 = Math.max(r.y + r.height, ...pts.map((p) => p.y + ROUTE_PAD));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export const isWireframe = (doc: Pick<DesignDocument, 'wireframe'>) => !!doc.wireframe;
