import { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { CANVAS_SIZE } from '@/types/canvas';
import { createId } from '@/lib/id';
import type { DrawTool } from '@/store/useUIStore';
import type { ShapeElement, ShapePoint } from '@/types/element';

const DEFAULT_FILL = '#211f1a';
const DEFAULT_SIZE = 140;
const CLICK_THRESHOLD = 6;
const MIN_POINT_SPACING = 4;

export interface ShapeDraft {
  shape: DrawTool & ('rectangle' | 'ellipse' | 'line' | 'pen');
  x: number;
  y: number;
  width: number;
  height: number;
  points?: ShapePoint[];
}

interface DrawGesture {
  pointerId: number;
  svg: SVGSVGElement;
  startX: number;
  startY: number;
  /** absolute virtual-space points, only used while drawing a pen stroke */
  rawPoints: ShapePoint[];
}

function toVirtualPoint(clientX: number, clientY: number, rect: DOMRect) {
  return { x: ((clientX - rect.left) / rect.width) * CANVAS_SIZE, y: ((clientY - rect.top) / rect.height) * CANVAS_SIZE };
}

function buildElement(draft: ShapeDraft): ShapeElement | null {
  const base = {
    id: createId(),
    rotation: 0,
    opacity: 100,
    flipH: false,
    flipV: false,
    locked: false,
  };

  if (draft.shape === 'pen') {
    const points = draft.points ?? [];
    if (points.length < 2) return null;
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return {
      ...base,
      type: 'shape',
      shape: 'path',
      x: centerX,
      y: centerY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
      fill: null,
      stroke: DEFAULT_FILL,
      strokeWidth: 4,
      points: points.map((p) => ({ x: p.x - centerX, y: p.y - centerY })),
    };
  }

  if (draft.shape === 'line') {
    if (Math.abs(draft.width) < 2 && Math.abs(draft.height) < 2) return null;
    return { ...base, type: 'shape', shape: 'line', x: draft.x, y: draft.y, width: draft.width, height: draft.height, fill: null, stroke: DEFAULT_FILL, strokeWidth: 4 };
  }

  // rectangle / ellipse
  return {
    ...base,
    type: 'shape',
    shape: draft.shape,
    x: draft.x,
    y: draft.y,
    width: Math.max(draft.width, 4),
    height: Math.max(draft.height, 4),
    fill: DEFAULT_FILL,
    stroke: DEFAULT_FILL,
    strokeWidth: 0,
    cornerRadius: draft.shape === 'rectangle' ? 0 : undefined,
  };
}

/**
 * Owns the draw gesture for shape tools (rectangle/ellipse/line/pen). Mutually
 * exclusive with useCanvasDrag's select/move gesture — CanvasStage routes to
 * whichever is active based on `activeTool`. A plain click (no meaningful drag)
 * places a default-sized shape, matching how icons/text are placed by a single
 * click elsewhere in the app; pen requires an actual stroke, a bare click is ignored.
 */
export function useShapeDrawing() {
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const setSelection = useUIStore((s) => s.setSelection);

  const gestureRef = useRef<DrawGesture | null>(null);
  const [draft, setDraft] = useState<ShapeDraft | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (activeTool === 'select') return;
      const svg = (e.target as Element).closest('svg') as SVGSVGElement | null;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const start = toVirtualPoint(e.clientX, e.clientY, rect);

      gestureRef.current = { pointerId: e.pointerId, svg, startX: start.x, startY: start.y, rawPoints: [start] };
      setDraft(
        activeTool === 'pen'
          ? { shape: 'pen', x: start.x, y: start.y, width: 0, height: 0, points: [{ x: 0, y: 0 }] }
          : { shape: activeTool, x: start.x, y: start.y, width: 0, height: 0 },
      );
      (e.target as Element).setPointerCapture(e.pointerId);
      e.stopPropagation();
    },
    [activeTool],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== e.pointerId) return;
      const rect = gesture.svg.getBoundingClientRect();
      const current = toVirtualPoint(e.clientX, e.clientY, rect);

      if (activeTool === 'pen') {
        const last = gesture.rawPoints[gesture.rawPoints.length - 1];
        if (Math.hypot(current.x - last.x, current.y - last.y) < MIN_POINT_SPACING) return;
        gesture.rawPoints.push(current);
        setDraft({
          shape: 'pen',
          x: gesture.startX,
          y: gesture.startY,
          width: 0,
          height: 0,
          points: gesture.rawPoints.map((p) => ({ x: p.x - gesture.startX, y: p.y - gesture.startY })),
        });
        return;
      }

      const dx = current.x - gesture.startX;
      const dy = current.y - gesture.startY;
      if (activeTool === 'line') {
        setDraft({ shape: 'line', x: gesture.startX + dx / 2, y: gesture.startY + dy / 2, width: dx, height: dy });
      } else if (activeTool === 'rectangle' || activeTool === 'ellipse') {
        setDraft({ shape: activeTool, x: gesture.startX + dx / 2, y: gesture.startY + dy / 2, width: Math.abs(dx), height: Math.abs(dy) });
      }
    },
    [activeTool],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== e.pointerId || !draft) {
        gestureRef.current = null;
        return;
      }

      let finalDraft = draft;
      const dragDistance = Math.hypot(draft.width, draft.height);
      if (draft.shape !== 'pen' && dragDistance < CLICK_THRESHOLD) {
        // Treat as a plain click: place a default-sized shape centered on the click point.
        finalDraft = { ...draft, width: DEFAULT_SIZE, height: DEFAULT_SIZE };
      }

      const element = buildElement(finalDraft);
      if (element) {
        useProjectStore.getState().addElement(element);
        setSelection([element.id]);
      }

      setActiveTool('select');
      setDraft(null);
      gestureRef.current = null;
    },
    [draft, setActiveTool, setSelection],
  );

  const cancelDraft = useCallback(() => {
    gestureRef.current = null;
    setDraft(null);
    setActiveTool('select');
  }, [setActiveTool]);

  return { isDrawing: activeTool !== 'select', draft, handlePointerDown, handlePointerMove, handlePointerUp, cancelDraft };
}
