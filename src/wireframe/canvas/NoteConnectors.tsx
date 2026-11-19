import { useDocStore } from '@/store/useDocStore';
import { useView } from '@/canvas/overlays/useView';
import { connectorOf, notesOf } from '../notes';
import { WF } from '../style';

/**
 * Thin lines from each attached note to its target (screen space, constant width). An overlay, not
 * document content: it follows both ends while they move and is never part of an export.
 */
export function NoteConnectors() {
  const doc = useDocStore((s) => s.doc);
  const { toScreen } = useView();
  if (!doc.wireframe) return null;
  return (
    <g aria-hidden="true" data-slot="note-connectors" stroke={WF.noteLine} strokeWidth={1.5} fill="none">
      {notesOf(doc).map((n) => {
        const c = connectorOf(doc, n);
        if (!c) return null;
        const a = toScreen(c.from);
        const b = toScreen(c.to);
        return (
          <g key={n.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray="4 3" />
            <circle cx={b.x} cy={b.y} r={3.5} fill={WF.noteLine} stroke="none" />
          </g>
        );
      })}
    </g>
  );
}
