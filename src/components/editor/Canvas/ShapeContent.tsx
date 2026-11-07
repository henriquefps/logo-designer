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
  pathData?: string;
  closed?: boolean;
}

/** Draws a straight segment when neither endpoint has a handle on that side (matches every
 * point the freehand pen tool has ever produced), or a real cubic Bézier when either does. */
function pathFromPoints(points: ShapePoint[], closed = false): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  let prev = first;

  const drawSegment = (from: ShapePoint, to: ShapePoint) => {
    const hasOutHandle = from.handleOutX !== undefined && from.handleOutY !== undefined;
    const hasInHandle = to.handleInX !== undefined && to.handleInY !== undefined;
    if (!hasOutHandle && !hasInHandle) {
      d += ` L ${to.x} ${to.y}`;
    } else {
      const c1x = hasOutHandle ? from.x + from.handleOutX! : from.x;
      const c1y = hasOutHandle ? from.y + from.handleOutY! : from.y;
      const c2x = hasInHandle ? to.x + to.handleInX! : to.x;
      const c2y = hasInHandle ? to.y + to.handleInY! : to.y;
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${to.x} ${to.y}`;
    }
  };

  for (const p of rest) {
    drawSegment(prev, p);
    prev = p;
  }
  // Closed shapes (converted from rectangle/ellipse) need an explicit closing segment — reusing
  // the same curve-or-line logic — since the points list itself never repeats its start point.
  if (closed && points.length > 1) {
    drawSegment(prev, first);
    d += ' Z';
  }
  return d;
}

/**
 * Renders shape geometry centered on the element's own origin (0,0) — same
 * "already centered" convention as text/image content in ElementNode. Shared
 * between ElementNode (real, placed shapes) and the live in-progress draft
 * preview while a shape tool is active, so both stay visually identical.
 */
export function ShapeContent({ shape, width, height, fill, stroke, strokeWidth, cornerRadius, points, pathData, closed }: ShapeContentProps) {
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

  // path from a boolean op — a real closed region (possibly with holes, e.g. a ring), so unlike
  // the freehand case below it can carry a fill.
  if (pathData) {
    return <path d={pathData} fill={fillValue} fillRule="nonzero" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
  }

  // path (freehand, or a converted rectangle/ellipse/line — closed converted shapes can carry a
  // fill, matching what they looked like before conversion; an open freehand stroke never has one).
  return (
    <path
      d={pathFromPoints(points ?? [], closed)}
      fill={closed ? fillValue : 'none'}
      fillRule="nonzero"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
