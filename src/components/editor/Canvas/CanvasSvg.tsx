import { useId } from 'react';
import type { CanvasSettings, BackgroundShape } from '@/types/canvas';
import { CANVAS_SIZE } from '@/types/canvas';
import type { LogoElement } from '@/types/element';
import type { MarqueeRect } from '@/hooks/useCanvasDrag';
import type { ShapeDraft } from '@/hooks/useShapeDrawing';
import type { SnapTarget } from '@/lib/snapping';
import { ElementNode } from './ElementNode';
import { SelectionOverlay } from './SelectionOverlay';
import { AlignmentGuides } from './AlignmentGuides';
import { MarqueeSelect } from './MarqueeSelect';
import { ShapeContent } from './ShapeContent';

function ShapeGeometry({ shape, fill, pointerEvents }: { shape: BackgroundShape; fill?: string; pointerEvents?: React.CSSProperties['pointerEvents'] }) {
  switch (shape) {
    case 'circle':
      return <circle cx={CANVAS_SIZE / 2} cy={CANVAS_SIZE / 2} r={CANVAS_SIZE / 2} fill={fill} pointerEvents={pointerEvents} />;
    case 'rounded':
      return <rect width={CANVAS_SIZE} height={CANVAS_SIZE} rx={64} ry={64} fill={fill} pointerEvents={pointerEvents} />;
    case 'squircle':
      return <rect width={CANVAS_SIZE} height={CANVAS_SIZE} rx={140} ry={140} fill={fill} pointerEvents={pointerEvents} />;
    default:
      return <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill={fill} pointerEvents={pointerEvents} />;
  }
}

interface CanvasSvgProps {
  canvasSettings: CanvasSettings;
  elements: LogoElement[];
  selectedIds: string[];
  hoveredId: string | null;
  textSizes: Record<string, { width: number; height: number }>;
  onMeasureText: (id: string, width: number, height: number) => void;
  onPointerDownElement: (e: React.PointerEvent<SVGGElement>, element: LogoElement) => void;
  onPointerDownBackground: (e: React.PointerEvent<SVGRectElement>) => void;
  onElementHover: (id: string | null) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  marqueeRect: MarqueeRect | null;
  guides: SnapTarget[];
  draft?: ShapeDraft | null;
}

export const CanvasSvg = ({
  ref,
  canvasSettings,
  elements,
  selectedIds,
  hoveredId,
  textSizes,
  onMeasureText,
  onPointerDownElement,
  onPointerDownBackground,
  onElementHover,
  onPointerMove,
  onPointerUp,
  marqueeRect,
  guides,
  draft,
}: CanvasSvgProps & { ref?: React.Ref<SVGSVGElement> }) => {
  const gradientId = useId();
  const clipId = useId();
  const { bgType, bgColor, bgGradientStart, bgGradientEnd, bgGradientAngle, bgShape } = canvasSettings;

  const backgroundFill = bgType === 'solid' ? bgColor : bgType === 'gradient' ? `url(#${gradientId})` : 'none';

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', touchAction: 'none' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <defs>
        {bgType === 'gradient' && (
          <linearGradient
            id={gradientId}
            x1={`${Math.max(0, 50 - 50 * Math.cos((bgGradientAngle * Math.PI) / 180))}%`}
            y1={`${Math.max(0, 50 - 50 * Math.sin((bgGradientAngle * Math.PI) / 180))}%`}
            x2={`${Math.min(100, 50 + 50 * Math.cos((bgGradientAngle * Math.PI) / 180))}%`}
            y2={`${Math.min(100, 50 + 50 * Math.sin((bgGradientAngle * Math.PI) / 180))}%`}
          >
            <stop offset="0%" stopColor={bgGradientStart} />
            <stop offset="100%" stopColor={bgGradientEnd} />
          </linearGradient>
        )}
        <clipPath id={clipId}>
          <ShapeGeometry shape={bgShape} />
        </clipPath>
      </defs>

      {/* Background hit-target: catches clicks/marquee-start on empty canvas, unclipped so the
          full square is always interactive even when the visible shape is a circle/rounded rect. */}
      <rect x={0} y={0} width={CANVAS_SIZE} height={CANVAS_SIZE} fill="transparent" pointerEvents="all" onPointerDown={onPointerDownBackground} />

      {/* Both the visible background fill AND every element share this clip, so a circle/rounded
          canvas actually crops overflowing content instead of only shaping the background rect. */}
      <g clipPath={`url(#${clipId})`}>
        {/* pointerEvents="none" — otherwise this fill (rendered above the catcher rect, since it
            needs to sit below elements but the catcher must stay unclipped) would swallow clicks
            meant for the catcher underneath, since it's topmost at every point it covers. */}
        {bgType !== 'transparent' && <ShapeGeometry shape={bgShape} fill={backgroundFill} pointerEvents="none" />}
        {elements.map((el) => (
          <ElementNode
            key={el.id}
            element={el}
            isSelected={selectedIds.includes(el.id)}
            isHovered={hoveredId === el.id}
            onPointerDown={onPointerDownElement}
            onPointerEnter={() => onElementHover(el.id)}
            onPointerLeave={() => onElementHover(null)}
            onMeasureText={onMeasureText}
          />
        ))}
      </g>

      <SelectionOverlay elements={elements} selectedIds={selectedIds} textSizes={textSizes} />
      <AlignmentGuides guides={guides} />
      <MarqueeSelect rect={marqueeRect} />

      {draft && (
        <g transform={`translate(${draft.x}, ${draft.y})`} pointerEvents="none">
          <ShapeContent
            shape={draft.shape === 'pen' ? 'path' : draft.shape}
            width={draft.width}
            height={draft.height}
            points={draft.points}
            fill={draft.shape === 'rectangle' || draft.shape === 'ellipse' ? 'color-mix(in oklch, var(--color-primary) 25%, transparent)' : null}
            stroke="var(--color-primary)"
            strokeWidth={2}
          />
        </g>
      )}
    </svg>
  );
};
