import { useView } from '@/canvas/overlays/useView';
import { useLayoutDropStore } from '../layoutDrag';

/** The insertion line while dragging into a stack (select tool overlay, screen pixels). */
export function LayoutDropOverlay() {
  const line = useLayoutDropStore((s) => s.line);
  const { toScreen } = useView();
  if (!line) return null;
  const a = toScreen(line.a);
  const b = toScreen(line.b);
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-primary" strokeWidth={2} strokeLinecap="round" />
      <circle cx={a.x} cy={a.y} r={3} className="fill-primary" />
      <circle cx={b.x} cy={b.y} r={3} className="fill-primary" />
    </g>
  );
}
