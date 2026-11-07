import { localToCanvasPoint } from '@/lib/pathGeometry';
import type { ShapeElement } from '@/types/element';
import type { NodeDragTarget } from '@/hooks/useNodeEdit';

interface NodeEditOverlayProps {
  element: ShapeElement;
  selectedNodeIndex: number | null;
  onPointDown: (e: React.PointerEvent, target: NodeDragTarget) => void;
  onSegmentDoubleClick: (e: React.MouseEvent, segmentIndex: number) => void;
}

const ANCHOR_SIZE = 8;
const HANDLE_RADIUS = 4;
const SEGMENT_HIT_WIDTH = 14;

/** Draws a path's anchors (squares) and Bézier handles (circles, connected by a thin line to
 * their anchor) in absolute canvas space while node-edit mode targets it. Rendered outside the
 * canvas's clipPath (alongside SelectionOverlay) so handles stay visible/grabbable even where
 * they fall outside the visible canvas shape while editing. */
export function NodeEditOverlay({ element, selectedNodeIndex, onPointDown, onSegmentDoubleClick }: NodeEditOverlayProps) {
  const points = element.points ?? [];

  return (
    <g>
      {/* Invisible wide-stroke hit targets, one per segment, so a double-click anywhere along a
          curve inserts a node there — drawn first so anchors/handles stay on top and grabbable. */}
      {points.slice(0, -1).map((p, i) => {
        const start = localToCanvasPoint(element, p);
        const end = localToCanvasPoint(element, points[i + 1]);
        const hasOut = p.handleOutX !== undefined && p.handleOutY !== undefined;
        const hasIn = points[i + 1].handleInX !== undefined && points[i + 1].handleInY !== undefined;
        let d = `M ${start.x} ${start.y}`;
        if (!hasOut && !hasIn) {
          d += ` L ${end.x} ${end.y}`;
        } else {
          const c1 = hasOut ? localToCanvasPoint(element, { x: p.x + p.handleOutX!, y: p.y + p.handleOutY! }) : start;
          const c2 = hasIn ? localToCanvasPoint(element, { x: points[i + 1].x + points[i + 1].handleInX!, y: points[i + 1].y + points[i + 1].handleInY! }) : end;
          d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
        }
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={SEGMENT_HIT_WIDTH}
            style={{ pointerEvents: 'stroke', cursor: 'copy' }}
            onDoubleClick={(e) => onSegmentDoubleClick(e, i)}
          />
        );
      })}
      {points.map((p, i) => {
        const anchor = localToCanvasPoint(element, p);
        const hasIn = p.handleInX !== undefined && p.handleInY !== undefined;
        const hasOut = p.handleOutX !== undefined && p.handleOutY !== undefined;
        const inHandle = hasIn ? localToCanvasPoint(element, { x: p.x + p.handleInX!, y: p.y + p.handleInY! }) : null;
        const outHandle = hasOut ? localToCanvasPoint(element, { x: p.x + p.handleOutX!, y: p.y + p.handleOutY! }) : null;

        return (
          <g key={i}>
            {inHandle && <line x1={anchor.x} y1={anchor.y} x2={inHandle.x} y2={inHandle.y} stroke="var(--color-primary)" strokeWidth={1} pointerEvents="none" />}
            {outHandle && <line x1={anchor.x} y1={anchor.y} x2={outHandle.x} y2={outHandle.y} stroke="var(--color-primary)" strokeWidth={1} pointerEvents="none" />}

            {inHandle && (
              <circle
                cx={inHandle.x}
                cy={inHandle.y}
                r={HANDLE_RADIUS}
                fill="var(--color-background)"
                stroke="var(--color-primary)"
                strokeWidth={1.5}
                style={{ cursor: 'move' }}
                onPointerDown={(e) => onPointDown(e, { kind: 'handleIn', index: i })}
              />
            )}
            {outHandle && (
              <circle
                cx={outHandle.x}
                cy={outHandle.y}
                r={HANDLE_RADIUS}
                fill="var(--color-background)"
                stroke="var(--color-primary)"
                strokeWidth={1.5}
                style={{ cursor: 'move' }}
                onPointerDown={(e) => onPointDown(e, { kind: 'handleOut', index: i })}
              />
            )}

            <rect
              x={anchor.x - ANCHOR_SIZE / 2}
              y={anchor.y - ANCHOR_SIZE / 2}
              width={ANCHOR_SIZE}
              height={ANCHOR_SIZE}
              fill={i === selectedNodeIndex ? 'var(--color-destructive)' : 'var(--color-primary)'}
              stroke="var(--color-background)"
              strokeWidth={i === selectedNodeIndex ? 2 : 1}
              style={{ cursor: 'move' }}
              onPointerDown={(e) => onPointDown(e, { kind: 'anchor', index: i })}
            />
          </g>
        );
      })}
    </g>
  );
}
