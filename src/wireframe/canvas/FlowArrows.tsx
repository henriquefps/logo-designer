import { useDocStore } from '@/store/useDocStore';
import { useView } from '@/canvas/overlays/useView';
import { useFlowStore } from '../flowCommands';
import { bezierAt, flowCurve, flowsOf } from '../flows';
import { arrowHead } from './arrowHead';

/**
 * Flow arrows of a wireframe document: a curve from each source element to the nearest edge of its
 * target frame, with an arrowhead and the optional label (screen space, constant width). An overlay,
 * not document content: it follows moves and is never part of a screen export.
 */
export function FlowArrows() {
  const doc = useDocStore((s) => s.doc);
  const selected = useFlowStore((s) => s.selected);
  const { toScreen } = useView();
  if (!doc.wireframe?.flows?.length) return null;
  return (
    <g aria-hidden="true" data-slot="flow-arrows" fill="none" fontSize={12} fontFamily="var(--font-sans, Inter, sans-serif)">
      {flowsOf(doc).map((f) => {
        const c = flowCurve(doc, f);
        if (!c) return null;
        const [a, b, cc, d] = c.points.map(toScreen);
        const on = f.id === selected;
        const color = on ? 'var(--primary)' : 'var(--foreground)';
        const mid = toScreen(bezierAt(c.points, 0.5));
        const w = f.label ? Math.ceil(f.label.length * 6.6) + 12 : 0;
        return (
          <g key={f.id} data-flow-id={f.id} opacity={on ? 1 : 0.6}>
            <path d={`M${a.x},${a.y} C${b.x},${b.y} ${cc.x},${cc.y} ${d.x},${d.y}`} stroke={color} strokeWidth={on ? 2 : 1.5} />
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
      })}
    </g>
  );
}
