import type { ShapeKind, ShapePoint } from '@/types/element';

interface ShapeContentProps {
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string | null;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  points?: ShapePoint[];
}

function pathFromPoints(points: ShapePoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ');
}

/**
 * Renders shape geometry centered on the element's own origin (0,0) — same
 * "already centered" convention as text/image content in ElementNode. Shared
 * between ElementNode (real, placed shapes) and the live in-progress draft
 * preview while a shape tool is active, so both stay visually identical.
 */
export function ShapeContent({ shape, width, height, fill, stroke, strokeWidth, cornerRadius, points }: ShapeContentProps) {
  const fillValue = fill ?? 'none';

  if (shape === 'rectangle') {
    return (
      <rect
        x={-Math.abs(width) / 2}
        y={-Math.abs(height) / 2}
        width={Math.abs(width)}
        height={Math.abs(height)}
        rx={cornerRadius ?? 0}
        ry={cornerRadius ?? 0}
        fill={fillValue}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (shape === 'ellipse') {
    return <ellipse cx={0} cy={0} rx={Math.abs(width) / 2} ry={Math.abs(height) / 2} fill={fillValue} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  if (shape === 'line') {
    return (
      <line x1={-width / 2} y1={-height / 2} x2={width / 2} y2={height / 2} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    );
  }

  // path (freehand)
  return <path d={pathFromPoints(points ?? [])} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
}
