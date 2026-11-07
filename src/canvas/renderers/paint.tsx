import type { ReactNode } from 'react';
import { gradientVector, splitColor, type Paint, type PaintedNode, type Stroke } from '@/model';

/** Unique gradient id for a node's paint slot. */
export const paintId = (nodeId: string, slot: string) => `${nodeId}-${slot}`;

export interface PaintResult {
  value: string;
  opacity?: number;
  def: ReactNode;
}

/** SVG attribute value (+ <defs> content for gradients) for a paint. Gradients use objectBoundingBox units. */
export function resolvePaint(nodeId: string, slot: string, paint: Paint): PaintResult {
  if (paint.kind === 'none') return { value: 'none', def: null };
  if (paint.kind === 'solid') {
    const { color, opacity } = splitColor(paint.color);
    return { value: color, opacity: opacity < 1 ? opacity : undefined, def: null };
  }
  const id = paintId(nodeId, slot);
  const stops = paint.stops.map((s, i) => {
    const { color, opacity } = splitColor(s.color);
    return <stop key={i} offset={s.offset} stopColor={color} stopOpacity={opacity < 1 ? opacity : undefined} />;
  });
  const def =
    paint.kind === 'linear' ? (
      <linearGradient id={id} {...gradientVector(paint.angle)}>
        {stops}
      </linearGradient>
    ) : (
      <radialGradient id={id} cx={0.5} cy={0.5} r={0.5}>
        {stops}
      </radialGradient>
    );
  return { value: `url(#${id})`, def };
}

export function strokeProps(stroke: Stroke, paint: PaintResult) {
  if (paint.value === 'none' || stroke.width <= 0) return { stroke: 'none' };
  return {
    stroke: paint.value,
    strokeOpacity: paint.opacity,
    strokeWidth: stroke.width,
    strokeLinecap: stroke.cap,
    strokeLinejoin: stroke.join,
    strokeDasharray: stroke.dash.length ? stroke.dash.join(' ') : undefined,
  };
}

/** Fill + stroke attributes and the defs needed for a painted node. */
export function paintedProps(node: PaintedNode) {
  const fill = resolvePaint(node.id, 'fill', node.fill);
  const stroke = resolvePaint(node.id, 'stroke', node.stroke.paint);
  const defs = fill.def || stroke.def ? (
    <defs>
      {fill.def}
      {stroke.def}
    </defs>
  ) : null;
  return {
    defs,
    props: { fill: fill.value, fillOpacity: fill.opacity, ...strokeProps(node.stroke, stroke) },
  };
}
