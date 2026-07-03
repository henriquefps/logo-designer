import { useCallback, useRef, useState } from 'react';
import { useProjectStore, useActiveProject } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { CANVAS_SIZE } from '@/types/canvas';
import type { LogoElement } from '@/types/element';
import { boundsFromCenter, computeSnapTargets, findSnap, type SnapTarget } from '@/lib/snapping';
import { getElementSize } from '@/lib/elementBounds';

const SNAP_TOLERANCE_PX = 6;

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragGesture {
  mode: 'elements' | 'marquee';
  pointerId: number;
  containerEl: Element;
  startClientX: number;
  startClientY: number;
  elementStarts: { id: string; x: number; y: number }[];
}

/**
 * Owns pointer-driven interaction on the canvas: element drag (single or
 * group), marquee selection, and snapping guides. Screen->virtual coordinate
 * conversion reads the container's *live* bounding rect on every event
 * (`getBoundingClientRect()` already reflects the current CSS zoom scale), so
 * dragging stays correct across zoom changes without tracking zoom separately.
 */
export function useCanvasDrag(textSizes: Record<string, { width: number; height: number }>) {
  const project = useActiveProject();
  const setElementPositions = useProjectStore((s) => s.setElementPositions);
  const beginGesture = useProjectStore((s) => s.beginGesture);
  const commit = useProjectStore((s) => s.commit);
  const selectedIds = useUIStore((s) => s.selectedIds);
  const setSelection = useUIStore((s) => s.setSelection);
  const zoom = useUIStore((s) => s.zoom);

  const gestureRef = useRef<DragGesture | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [activeGuides, setActiveGuides] = useState<SnapTarget[]>([]);

  const toVirtualPoint = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  }, []);

  const boundsOf = useCallback(
    (el: LogoElement) => {
      const size = getElementSize(el, textSizes[el.id]);
      return boundsFromCenter(el.id, el.x, el.y, size.width, size.height);
    },
    [textSizes],
  );

  const handlePointerDownElement = useCallback(
    (e: React.PointerEvent<SVGGElement>, element: LogoElement) => {
      if (element.locked || !project) return;
      e.stopPropagation();

      let nextSelection: string[];
      if (e.shiftKey) {
        nextSelection = selectedIds.includes(element.id) ? selectedIds.filter((id) => id !== element.id) : [...selectedIds, element.id];
      } else if (selectedIds.includes(element.id)) {
        nextSelection = selectedIds;
      } else {
        nextSelection = [element.id];
      }
      setSelection(nextSelection);

      if (e.shiftKey && !nextSelection.includes(element.id)) return;

      const container = (e.currentTarget.ownerSVGElement ?? e.currentTarget) as Element;
      const elementStarts = project.elements.filter((el) => nextSelection.includes(el.id)).map((el) => ({ id: el.id, x: el.x, y: el.y }));

      beginGesture();
      gestureRef.current = {
        mode: 'elements',
        pointerId: e.pointerId,
        containerEl: container,
        startClientX: e.clientX,
        startClientY: e.clientY,
        elementStarts,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [project, selectedIds, setSelection, beginGesture],
  );

  const handlePointerDownBackground = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!project) return;
      const container = e.currentTarget.ownerSVGElement ?? e.currentTarget;
      const rect = container.getBoundingClientRect();
      const start = toVirtualPoint(e.clientX, e.clientY, rect);

      gestureRef.current = {
        mode: 'marquee',
        pointerId: e.pointerId,
        containerEl: container,
        startClientX: e.clientX,
        startClientY: e.clientY,
        elementStarts: [],
      };
      setMarqueeRect({ x: start.x, y: start.y, width: 0, height: 0 });
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [project, toVirtualPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== e.pointerId || !project) return;
      const rect = gesture.containerEl.getBoundingClientRect();

      if (gesture.mode === 'marquee') {
        const start = toVirtualPoint(gesture.startClientX, gesture.startClientY, rect);
        const current = toVirtualPoint(e.clientX, e.clientY, rect);
        setMarqueeRect({
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y),
        });
        return;
      }

      const dxScreen = e.clientX - gesture.startClientX;
      const dyScreen = e.clientY - gesture.startClientY;
      let dx = (dxScreen / rect.width) * CANVAS_SIZE;
      let dy = (dyScreen / rect.height) * CANVAS_SIZE;

      // Snap the primary dragged element against canvas guides + non-dragged siblings.
      const draggedIds = new Set(gesture.elementStarts.map((s) => s.id));
      const primary = gesture.elementStarts[0];
      const primaryElement = project.elements.find((el) => el.id === primary?.id);
      if (primaryElement) {
        const siblings = project.elements.filter((el) => !draggedIds.has(el.id)).map(boundsOf);
        const targets = computeSnapTargets(CANVAS_SIZE, siblings);
        const draggedBounds = boundsOf({ ...primaryElement, x: primary.x + dx, y: primary.y + dy });
        const snap = findSnap(draggedBounds, targets, SNAP_TOLERANCE_PX / zoom);
        dx += snap.dx;
        dy += snap.dy;
        setActiveGuides(snap.activeGuides);
      }

      setElementPositions(gesture.elementStarts.map((s) => ({ id: s.id, x: s.x + dx, y: s.y + dy })));
    },
    [project, toVirtualPoint, boundsOf, zoom, setElementPositions],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== e.pointerId) return;

      if (gesture.mode === 'marquee') {
        const rect = marqueeRect;
        const wasDrag = rect && rect.width > 4 && rect.height > 4;
        if (wasDrag && project) {
          const hits = project.elements
            .filter((el) => {
              const b = boundsOf(el);
              return b.left < rect.x + rect.width && b.right > rect.x && b.top < rect.y + rect.height && b.bottom > rect.y;
            })
            .map((el) => el.id);
          setSelection(e.shiftKey ? Array.from(new Set([...selectedIds, ...hits])) : hits);
        } else if (!e.shiftKey) {
          setSelection([]);
        }
        setMarqueeRect(null);
      } else {
        commit();
        setActiveGuides([]);
      }

      gestureRef.current = null;
    },
    [marqueeRect, project, boundsOf, selectedIds, setSelection, commit],
  );

  return {
    marqueeRect,
    activeGuides,
    handlePointerDownElement,
    handlePointerDownBackground,
    handlePointerMove,
    handlePointerUp,
  };
}
