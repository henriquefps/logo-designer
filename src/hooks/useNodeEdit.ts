import { useCallback, useRef, useState } from 'react';
import { useProjectStore, useActiveProject } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { CANVAS_SIZE } from '@/types/canvas';
import { canvasDeltaToLocalDelta } from '@/lib/pathGeometry';
import { nearestTOnCubic, splitCubicBezier } from '@/lib/bezierSplit';
import type { ShapeElement, ShapePoint } from '@/types/element';

export type NodeDragTarget = { kind: 'anchor' | 'handleIn' | 'handleOut'; index: number };

interface NodeDragGesture {
  pointerId: number;
  containerEl: Element;
  startClientX: number;
  startClientY: number;
  target: NodeDragTarget;
  startPoints: ShapePoint[];
}

/**
 * Owns the node-edit interaction: dragging a path's anchor points and Bézier handles once
 * `nodeEditElementId` (useUIStore) targets one. Mutually exclusive with normal element drag by
 * construction — the overlay's own hit targets call `stopPropagation`, so a handle drag never
 * reaches ElementNode's pointerdown; dragging the shape's *body* (not a handle) still falls
 * through to the normal move-the-whole-element gesture, same as any other element.
 */
export function useNodeEdit() {
  const project = useActiveProject();
  const nodeEditElementId = useUIStore((s) => s.nodeEditElementId);
  const setNodeEditElementId = useUIStore((s) => s.setNodeEditElementId);
  const updateElement = useProjectStore((s) => s.updateElement);
  const beginGesture = useProjectStore((s) => s.beginGesture);
  const commit = useProjectStore((s) => s.commit);

  const gestureRef = useRef<NodeDragGesture | null>(null);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);

  const found = nodeEditElementId ? project?.elements.find((el) => el.id === nodeEditElementId) : undefined;
  const targetElement = found && found.type === 'shape' && found.shape === 'path' && !found.pathData ? (found as ShapeElement) : undefined;

  // A node selected in one path shouldn't carry over as "selected" once node-edit targets a
  // different element (or none) — a stale index could even point at an out-of-range position.
  // Adjusted during render (React's documented pattern for resetting state on a prop change)
  // rather than in an effect, to avoid an extra cascading render.
  const lastTargetIdRef = useRef(targetElement?.id);
  if (lastTargetIdRef.current !== targetElement?.id) {
    lastTargetIdRef.current = targetElement?.id;
    if (selectedNodeIndex !== null) setSelectedNodeIndex(null);
  }

  const exit = useCallback(() => setNodeEditElementId(null), [setNodeEditElementId]);

  const handlePointDown = useCallback(
    (e: React.PointerEvent, target: NodeDragTarget) => {
      if (!targetElement) return;
      e.stopPropagation();
      if (target.kind === 'anchor') setSelectedNodeIndex(target.index);
      const container = ((e.currentTarget as Element).ownerSVGElement ?? e.currentTarget) as Element;
      beginGesture();
      gestureRef.current = {
        pointerId: e.pointerId,
        containerEl: container,
        startClientX: e.clientX,
        startClientY: e.clientY,
        target,
        startPoints: (targetElement.points ?? []).map((p) => ({ ...p })),
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [targetElement, beginGesture],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== e.pointerId || !targetElement) return;
      const rect = gesture.containerEl.getBoundingClientRect();
      const dxCanvas = ((e.clientX - gesture.startClientX) / rect.width) * CANVAS_SIZE;
      const dyCanvas = ((e.clientY - gesture.startClientY) / rect.height) * CANVAS_SIZE;
      const local = canvasDeltaToLocalDelta(targetElement, dxCanvas, dyCanvas);

      const { index, kind } = gesture.target;
      const nextPoints = gesture.startPoints.map((p, i) => {
        if (i !== index) return p;
        if (kind === 'anchor') return { ...p, x: p.x + local.x, y: p.y + local.y };
        if (kind === 'handleOut') return { ...p, handleOutX: (p.handleOutX ?? 0) + local.x, handleOutY: (p.handleOutY ?? 0) + local.y };
        return { ...p, handleInX: (p.handleInX ?? 0) + local.x, handleInY: (p.handleInY ?? 0) + local.y };
      });
      updateElement(targetElement.id, { points: nextPoints });
    },
    [targetElement, updateElement],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== e.pointerId) return;
      commit();
      gestureRef.current = null;
    },
    [commit],
  );

  // Inserts a new anchor into segment [segmentIndex, segmentIndex + 1] at the point on that
  // segment nearest `canvasPoint` (a double-click position). Straight segments (neither endpoint
  // has a handle, matching pathFromPoints' own "when to draw L vs C" rule) split at the
  // perpendicular projection onto the line; curved segments split via De Casteljau at the
  // closest-sampled t, so both curve halves retrace the original exactly.
  const insertNode = useCallback(
    (segmentIndex: number, canvasPoint: { x: number; y: number }) => {
      if (!targetElement) return;
      const points = targetElement.points ?? [];
      const p0 = points[segmentIndex];
      const p1 = points[segmentIndex + 1];
      if (!p0 || !p1) return;

      const local = canvasDeltaToLocalDelta(targetElement, canvasPoint.x - targetElement.x, canvasPoint.y - targetElement.y);
      const hasOut = p0.handleOutX !== undefined && p0.handleOutY !== undefined;
      const hasIn = p1.handleInX !== undefined && p1.handleInY !== undefined;

      let nextP0: ShapePoint = p0;
      let nextP1: ShapePoint = p1;
      let newPoint: ShapePoint;

      if (!hasOut && !hasIn) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0.5 : Math.min(1, Math.max(0, ((local.x - p0.x) * dx + (local.y - p0.y) * dy) / len2));
        newPoint = { x: p0.x + dx * t, y: p0.y + dy * t };
      } else {
        const P0 = { x: p0.x, y: p0.y };
        const P1 = hasOut ? { x: p0.x + p0.handleOutX!, y: p0.y + p0.handleOutY! } : P0;
        const P3 = { x: p1.x, y: p1.y };
        const P2 = hasIn ? { x: p1.x + p1.handleInX!, y: p1.y + p1.handleInY! } : P3;
        const t = nearestTOnCubic(P0, P1, P2, P3, local);
        const { left, right, point } = splitCubicBezier(P0, P1, P2, P3, t);
        nextP0 = { ...p0, handleOutX: left[1].x - p0.x, handleOutY: left[1].y - p0.y };
        nextP1 = { ...p1, handleInX: right[2].x - p1.x, handleInY: right[2].y - p1.y };
        newPoint = {
          x: point.x,
          y: point.y,
          handleInX: left[2].x - point.x,
          handleInY: left[2].y - point.y,
          handleOutX: right[1].x - point.x,
          handleOutY: right[1].y - point.y,
        };
      }

      const nextPoints = [...points];
      nextPoints[segmentIndex] = nextP0;
      nextPoints[segmentIndex + 1] = nextP1;
      nextPoints.splice(segmentIndex + 1, 0, newPoint);

      beginGesture();
      updateElement(targetElement.id, { points: nextPoints });
      commit();
      setSelectedNodeIndex(segmentIndex + 1);
    },
    [targetElement, beginGesture, updateElement, commit],
  );

  const handleSegmentDoubleClick = useCallback(
    (e: React.MouseEvent, segmentIndex: number) => {
      if (!targetElement) return;
      e.stopPropagation();
      const container = ((e.currentTarget as Element).ownerSVGElement ?? e.currentTarget) as Element;
      const rect = container.getBoundingClientRect();
      insertNode(segmentIndex, {
        x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
        y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
      });
    },
    [targetElement, insertNode],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!targetElement || selectedNodeIndex === null) return;
    const points = targetElement.points ?? [];
    // A path needs at least 2 points to draw anything — refuse to edit it out of existence.
    if (points.length <= 2) return;
    const nextPoints = points.filter((_, i) => i !== selectedNodeIndex);
    beginGesture();
    updateElement(targetElement.id, { points: nextPoints });
    commit();
    setSelectedNodeIndex(null);
  }, [targetElement, selectedNodeIndex, beginGesture, updateElement, commit]);

  return {
    isActive: Boolean(targetElement),
    targetElement,
    selectedNodeIndex,
    exit,
    handlePointDown,
    handlePointerMove,
    handlePointerUp,
    handleSegmentDoubleClick,
    deleteSelectedNode,
  };
}
