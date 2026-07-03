import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/store/useUIStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

interface PanGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
}

/** Wheel zoom (Ctrl/Cmd+scroll) + trackpad pan (plain scroll) + space-drag panning + fit-to-screen. */
export function useCanvasZoomPan() {
  const zoom = useUIStore((s) => s.zoom);
  const pan = useUIStore((s) => s.pan);
  const setZoom = useUIStore((s) => s.setZoom);
  const setPan = useUIStore((s) => s.setPan);
  const resetView = useUIStore((s) => s.resetView);

  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const panGesture = useRef<PanGesture | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !isEditableTarget(e.target)) {
        setIsSpacePanning(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') setIsSpacePanning(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => z * (1 - e.deltaY * 0.01));
      } else {
        setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
      }
    },
    [pan, setZoom, setPan],
  );

  const handlePanPointerDown = useCallback(
    (e: React.PointerEvent) => {
      panGesture.current = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startPanX: pan.x, startPanY: pan.y };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const handlePanPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const gesture = panGesture.current;
      if (!gesture || gesture.pointerId !== e.pointerId) return;
      setPan({ x: gesture.startPanX + (e.clientX - gesture.startClientX), y: gesture.startPanY + (e.clientY - gesture.startClientY) });
    },
    [setPan],
  );

  const handlePanPointerUp = useCallback((e: React.PointerEvent) => {
    if (panGesture.current?.pointerId === e.pointerId) panGesture.current = null;
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => z + 0.1), [setZoom]);
  const zoomOut = useCallback(() => setZoom((z) => z - 0.1), [setZoom]);
  const fitToScreen = useCallback(() => resetView(), [resetView]);

  return {
    zoom,
    pan,
    isSpacePanning,
    handleWheel,
    handlePanPointerDown,
    handlePanPointerMove,
    handlePanPointerUp,
    zoomIn,
    zoomOut,
    fitToScreen,
    setZoom,
  };
}
