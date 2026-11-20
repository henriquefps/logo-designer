import { useDocStore } from '@/store/useDocStore';
import { useView } from '@/canvas/overlays/useView';
import { canvasLabelBand } from '../flows';
import { connectorPoints, notesOf } from '../notes';
import { routePath } from '../routing';
import { WF } from '../style';

/**
 * Thin dashed lines from each attached note to its target (screen space, constant width), routed around the other
 * screens like flow arrows when a straight line would cross one (`connectorPoints`). An overlay, not document
 * content: it follows both ends while they move and is never part of an export.
 */
export function NoteConnectors() {
  const doc = useDocStore((s) => s.doc);
  const { zoom, toScreen } = useView();
  if (!doc.wireframe) return null;
  const band = canvasLabelBand(zoom);
  return (
    <g aria-hidden="true" data-slot="note-connectors" stroke={WF.noteLine} strokeWidth={1.5} fill="none">
      {notesOf(doc).map((n) => {
        const c = connectorPoints(doc, n, { band });
        if (!c) return null;
        const pts = c.map(toScreen);
        const b = pts[pts.length - 1];
        return (
          <g key={n.id} data-note-id={n.id}>
            <path d={routePath(pts, 6)} strokeDasharray="4 3" strokeLinejoin="round" />
            <circle cx={b.x} cy={b.y} r={3.5} fill={WF.noteLine} stroke="none" />
          </g>
        );
      })}
    </g>
  );
}
