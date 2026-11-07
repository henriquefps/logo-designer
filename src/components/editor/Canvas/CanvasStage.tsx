import { useCallback, useEffect, useRef } from 'react';
import { useActiveProject } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { useCanvasRef } from '@/hooks/useCanvasRef';
import { useCanvasDrag } from '@/hooks/useCanvasDrag';
import { useCanvasZoomPan } from '@/hooks/useCanvasZoomPan';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useShapeDrawing } from '@/hooks/useShapeDrawing';
import { useNodeEdit } from '@/hooks/useNodeEdit';
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
  const nodeEdit = useNodeEdit();
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

  // Escape also exits node-edit mode — there's no other affordance to leave it yet
  // (add/remove-node and a visible "done" control are a later checkpoint).
  //
  // This listener is attached ONCE (empty deps) and reads current state through a ref, rather
  // than being re-subscribed every time `nodeEdit.isActive` changes. That's not just tidiness:
  // useKeyboardShortcuts' own Escape handler (registered earlier, so it runs first on the same
  // `window` keydown dispatch) calls `clearSelection()`, which triggers a synchronous re-render.
  // If this effect depended on `nodeEdit` directly, that re-render would tear down and re-attach
  // this listener *while the current keydown event is still dispatching* — and per the DOM spec,
  // a listener added during an event's dispatch does not fire for that same event, so Escape
  // would silently fail to exit node-edit mode on the very keypress that triggered it (confirmed
  // this actually happening via a Playwright repro before switching to the ref pattern below).
  const nodeEditRef = useRef(nodeEdit);
  useEffect(() => {
    nodeEditRef.current = nodeEdit;
  });
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!nodeEditRef.current.isActive) return;
      if (e.key === 'Escape') nodeEditRef.current.exit();
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        nodeEditRef.current.deleteSelectedNode();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePointerDownElement: typeof drag.handlePointerDownElement = useCallback(
    (e, el) => {
      if (nodeEdit.isActive && el.id !== nodeEdit.targetElement?.id) nodeEdit.exit();
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
    [zoomPan, shapeDrawing, drag, nodeEdit],
  );

  const handlePointerDownBackground: typeof drag.handlePointerDownBackground = useCallback(
    (e) => {
      if (nodeEdit.isActive) nodeEdit.exit();
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
    [zoomPan, shapeDrawing, drag, nodeEdit],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      zoomPan.handlePanPointerMove(e);
      shapeDrawing.handlePointerMove(e);
      nodeEdit.handlePointerMove(e);
      drag.handlePointerMove(e);
    },
    [zoomPan, shapeDrawing, drag, nodeEdit],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      zoomPan.handlePanPointerUp(e);
      shapeDrawing.handlePointerUp(e);
      nodeEdit.handlePointerUp(e);
      drag.handlePointerUp(e);
    },
    [zoomPan, shapeDrawing, drag, nodeEdit],
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
            nodeEditElement={nodeEdit.targetElement}
            nodeEditSelectedIndex={nodeEdit.selectedNodeIndex}
            onNodeEditPointDown={nodeEdit.handlePointDown}
            onNodeEditSegmentDoubleClick={nodeEdit.handleSegmentDoubleClick}
          />
        </div>
      </div>
    </div>
  );
}
