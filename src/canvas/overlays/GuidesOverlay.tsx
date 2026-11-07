import { useEditorStore } from '@/store/useEditorStore';
import { useView } from './useView';

/** Smart guides (snap lines) and the marquee rectangle. */
export function GuidesOverlay() {
  const guides = useEditorStore((s) => s.guides);
  const marquee = useEditorStore((s) => s.marquee);
  const viewport = useEditorStore((s) => s.viewport);
  const { toScreen } = useView();
  return (
    <g pointerEvents="none">
      {guides.map((g, i) => {
        const p = toScreen({ x: g.position, y: g.position });
        return g.axis === 'x' ? (
          <line key={i} x1={p.x} x2={p.x} y1={0} y2={viewport.height} stroke="var(--destructive)" strokeWidth={1} />
        ) : (
          <line key={i} y1={p.y} y2={p.y} x1={0} x2={viewport.width} stroke="var(--destructive)" strokeWidth={1} />
        );
      })}
      {marquee &&
        (() => {
          const a = toScreen(marquee);
          const b = toScreen({ x: marquee.x + marquee.width, y: marquee.y + marquee.height });
          return (
            <rect
              x={a.x}
              y={a.y}
              width={b.x - a.x}
              height={b.y - a.y}
              fill="var(--primary)"
              fillOpacity={0.08}
              stroke="var(--primary)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          );
        })()}
    </g>
  );
}
