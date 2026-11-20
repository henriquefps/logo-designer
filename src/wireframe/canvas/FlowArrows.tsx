import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from '@/canvas/overlays/useView';
import { useFlowStore } from '../flowCommands';
import { canvasArrowOptions, flowLayout } from '../flows';
import { placeLabels, routePath } from '../routing';
import { arrowHead } from './arrowHead';

/** Label pill size in screen px. */
const labelWidth = (label: string) => Math.ceil(label.length * 6.6) + 12;
const LABEL_H = 20;

/**
 * Flow arrows of a wireframe document: from each source element (or part of one) to a side of its target frame,
 * routed through the gutters so they never pass over another screen (src/wireframe/routing.ts), with an arrowhead and
 * the optional label on a clear stretch (screen space, constant width). Flows defined in a shared component's master
 * are dashed and drawn once (from the selected instance, else the first). An overlay, not document content: it follows
 * moves and is never part of a screen export.
 */
export function FlowArrows() {
  const doc = useDocStore((s) => s.doc);
  const selected = useFlowStore((s) => s.selected);
  const selection = useEditorStore((s) => s.selection);
  const { zoom, toScreen } = useView();
  if (!doc.wireframe?.flows?.length) return null;
  const { arrows, avoid } = flowLayout(doc, canvasArrowOptions(zoom, selection));
  const spots = placeLabels(
    arrows.map((a) => a.route),
    arrows.map((a) => (a.flow.label ? { width: (labelWidth(a.flow.label) + 4) / zoom, height: (LABEL_H + 4) / zoom } : null)),
    avoid,
  );
  return (
    <g aria-hidden="true" data-slot="flow-arrows" fill="none" fontSize={12} fontFamily="var(--font-sans, Inter, sans-serif)">
      {arrows.map(({ flow: f, source, route }, i) => {
        const pts = route.points.map(toScreen);
        const on = f.id === selected;
        const color = on ? 'var(--primary)' : 'var(--foreground)';
        const spot = spots[i] && toScreen(spots[i]);
        const w = f.label ? labelWidth(f.label) : 0;
        return (
          <g key={`${f.id}:${source}`} data-flow-id={f.id} data-flow-part={f.part} opacity={on ? 1 : 0.6}>
            <path d={routePath(pts, 8)} stroke={color} strokeWidth={on ? 2 : 1.5} strokeDasharray={f.symbol ? '6 3' : undefined} strokeLinejoin="round" />
            <circle cx={pts[0].x} cy={pts[0].y} r={3} fill={color} />
            <path d={arrowHead(pts[pts.length - 1], route.dir)} fill={color} />
            {f.label && spot && (
              <g>
                <rect x={spot.x - w / 2} y={spot.y - LABEL_H / 2} width={w} height={LABEL_H} rx={10} fill="var(--background)" stroke={color} strokeWidth={1} />
                <text x={spot.x} y={spot.y + 4} textAnchor="middle" fill={color} stroke="none">
                  {f.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
