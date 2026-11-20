import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from '@/canvas/overlays/useView';
import { useFlowStore } from '../flowCommands';
import { bezierAt, flowCurves, flowsOf } from '../flows';
import { arrowHead } from './arrowHead';

/**
 * Flow arrows of a wireframe document: a curve from each source element (or part of one) to the nearest edge of its
 * target frame, with an arrowhead and the optional label (screen space, constant width). Flows defined in a shared
 * component's master are dashed and drawn once (from the selected instance, else the first). An overlay, not document content: it follows moves
 * and is never part of a screen export.
 */
export function FlowArrows() {
  const doc = useDocStore((s) => s.doc);
  const selected = useFlowStore((s) => s.selected);
  const selection = useEditorStore((s) => s.selection);
  const { toScreen } = useView();
  if (!doc.wireframe?.flows?.length) return null;
  return (
    <g aria-hidden="true" data-slot="flow-arrows" fill="none" fontSize={12} fontFamily="var(--font-sans, Inter, sans-serif)">
      {flowsOf(doc).flatMap((f) =>
        // A shared flow (defined in a master) is one link: one arrow, from the selected instance when there is one.
        flowCurves(doc, f, { selection }).map(({ source, curve: c }) => {
          const [a, b, cc, d] = c.points.map(toScreen);
          const on = f.id === selected;
          const color = on ? 'var(--primary)' : 'var(--foreground)';
          const mid = toScreen(bezierAt(c.points, 0.5));
          const w = f.label ? Math.ceil(f.label.length * 6.6) + 12 : 0;
          return (
            <g key={`${f.id}:${source}`} data-flow-id={f.id} data-flow-part={f.part} opacity={on ? 1 : 0.6}>
              <path d={`M${a.x},${a.y} C${b.x},${b.y} ${cc.x},${cc.y} ${d.x},${d.y}`} stroke={color} strokeWidth={on ? 2 : 1.5} strokeDasharray={f.symbol ? '6 3' : undefined} />
              <circle cx={a.x} cy={a.y} r={3} fill={color} />
              <path d={arrowHead(d, c.dir)} fill={color} />
              {f.label && (
                <g>
                  <rect x={mid.x - w / 2} y={mid.y - 10} width={w} height={20} rx={10} fill="var(--background)" stroke={color} strokeWidth={1} />
                  <text x={mid.x} y={mid.y + 4} textAnchor="middle" fill={color} stroke="none">
                    {f.label}
                  </text>
                </g>
              )}
            </g>
          );
        }),
      )}
    </g>
  );
}
