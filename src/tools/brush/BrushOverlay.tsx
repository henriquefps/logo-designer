import { useView } from '@/canvas/overlays/useView';
import { brushOutline } from '@/vector/freehand';
import { useBrush } from './state';

/** Live preview of the variable-width stroke. */
export function BrushOverlay() {
  const { points, size, thinning } = useBrush();
  const { toScreen } = useView();
  if (points.length < 2) return null;
  const outline = brushOutline(points, { size, thinning }, false).map(toScreen);
  if (outline.length < 3) return null;
  const d = `M${outline.map((p) => `${p.x} ${p.y}`).join('L')}Z`;
  return <path d={d} fill="var(--foreground)" fillOpacity={0.85} />;
}
