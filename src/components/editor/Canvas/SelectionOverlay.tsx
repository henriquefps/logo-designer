import type { LogoElement } from '@/types/element';
import { getElementSize } from '@/lib/elementBounds';

interface SelectionOverlayProps {
  elements: LogoElement[];
  selectedIds: string[];
  textSizes: Record<string, { width: number; height: number }>;
}

/** Dashed bounding boxes for selected elements, using real measured sizes (getBBox for text). */
export function SelectionOverlay({ elements, selectedIds, textSizes }: SelectionOverlayProps) {
  const selectedSet = new Set(selectedIds);
  const selected = elements.filter((el) => selectedSet.has(el.id));

  return (
    <g data-selection-overlay="true" pointerEvents="none">
      {selected.map((el) => {
        const { width, height } = getElementSize(el, textSizes[el.id]);
        const padding = 6;
        return (
          <rect
            key={el.id}
            x={el.x - width / 2 - padding}
            y={el.y - height / 2 - padding}
            width={width + padding * 2}
            height={height + padding * 2}
            fill="none"
            strokeDasharray="4,3"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: 'var(--color-primary)' }}
          />
        );
      })}
    </g>
  );
}
