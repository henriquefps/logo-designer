import { useView } from '@/canvas/overlays/useView';
import { usePencil } from './state';

/** Live polyline of the stroke being drawn. */
export function PencilOverlay() {
  const points = usePencil((s) => s.points);
  const { toScreen } = useView();
  if (points.length < 2) return null;
  const pts = points.map((p) => {
    const s = toScreen(p);
    return `${s.x},${s.y}`;
  });
  return <polyline points={pts.join(' ')} fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />;
}
