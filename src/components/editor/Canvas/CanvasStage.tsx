import { useCallback, useEffect } from 'react';
import { useActiveProject } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { useCanvasRef } from '@/hooks/useCanvasRef';
import { useCanvasDrag } from '@/hooks/useCanvasDrag';
import { useCanvasZoomPan } from '@/hooks/useCanvasZoomPan';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useShapeDrawing } from '@/hooks/useShapeDrawing';
import { CanvasSvg } from './CanvasSvg';
import { CANVAS_SIZE } from '@/types/canvas';

export function CanvasStage() {
  const svgRef = useCanvasRef();
  const project = useActiveProject();
  const selectedIds = useUIStore((s) => s.selectedIds);
  const hoveredId = useUIStore((s) => s.hoveredId);
  const setHovered = useUIStore((s) => s.setHovered);
  const textSizes = useUIStore((s) => s.textSizes);
  const onMeasureText = useUIStore((s) => s.setTextSize);

  const drag = useCanvasDrag(textSizes);
  const zoomPan = useCanvasZoomPan();
  const shapeDrawing = useShapeDrawing();
  useKeyboardShortcuts();

  // Escape cancels an in-progress or armed shape tool, independent of the general
  // selection-clearing Escape handling in useKeyboardShortcuts.
  useEffect(() => {
    if (!shapeDrawing.isDrawing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') shapeDrawing.cancelDraft();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shapeDrawing]);

  const handlePointerDownElement: typeof drag.handlePointerDownElement = useCallback(
    (e, el) => {
      if (zoomPan.isSpacePanning) {
        zoomPan.handlePanPointerDown(e);
        return;
      }
      if (shapeDrawing.isDrawing) {
        shapeDrawing.handlePointerDown(e);
        return;
      }
      drag.handlePointerDownElement(e, el);
    },
    [zoomPan, shapeDrawing, drag],
  );

  const handlePointerDownBackground: typeof drag.handlePointerDownBackground = useCallback(
    (e) => {
      if (zoomPan.isSpacePanning) {
        zoomPan.handlePanPointerDown(e);
        return;
      }
      if (shapeDrawing.isDrawing) {
        shapeDrawing.handlePointerDown(e);
        return;
      }
      drag.handlePointerDownBackground(e);
    },
    [zoomPan, shapeDrawing, drag],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      zoomPan.handlePanPointerMove(e);
      shapeDrawing.handlePointerMove(e);
      drag.handlePointerMove(e);
    },
    [zoomPan, shapeDrawing, drag],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      zoomPan.handlePanPointerUp(e);
      shapeDrawing.handlePointerUp(e);
      drag.handlePointerUp(e);
    },
    [zoomPan, shapeDrawing, drag],
  );

  if (!project) return null;

  return (
    <div
      className="checkerboard relative flex-1 overflow-hidden bg-muted/40"
      onWheel={zoomPan.handleWheel}
      style={{ cursor: zoomPan.isSpacePanning ? 'grab' : shapeDrawing.isDrawing ? 'crosshair' : undefined }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ transform: `translate(${zoomPan.pan.x}px, ${zoomPan.pan.y}px) scale(${zoomPan.zoom})` }}
      >
        <div
          className="shrink-0 overflow-hidden rounded-md shadow-2xl ring-1 ring-border"
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
        >
          <CanvasSvg
            ref={svgRef}
            canvasSettings={project.canvasSettings}
            elements={project.elements}
            selectedIds={selectedIds}
            hoveredId={hoveredId}
            textSizes={textSizes}
            onMeasureText={onMeasureText}
            onPointerDownElement={handlePointerDownElement}
            onPointerDownBackground={handlePointerDownBackground}
            onElementHover={setHovered}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            marqueeRect={drag.marqueeRect}
            guides={drag.activeGuides}
            draft={shapeDrawing.draft}
          />
        </div>
      </div>
    </div>
  );
}
