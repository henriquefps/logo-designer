import type { SnapTarget } from '@/lib/snapping';
import { CANVAS_SIZE } from '@/types/canvas';

export function AlignmentGuides({ guides }: { guides: SnapTarget[] }) {
  if (guides.length === 0) return null;
  return (
    <g pointerEvents="none">
      {guides.map((guide, i) => (
        <line
          key={`${guide.axis}-${i}`}
          x1={guide.axis === 'x' ? guide.position : 0}
          y1={guide.axis === 'x' ? 0 : guide.position}
          x2={guide.axis === 'x' ? guide.position : CANVAS_SIZE}
          y2={guide.axis === 'x' ? CANVAS_SIZE : guide.position}
          strokeWidth={1}
          strokeDasharray="2,2"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--color-destructive)' }}
        />
      ))}
    </g>
  );
}
