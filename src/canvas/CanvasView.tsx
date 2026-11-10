import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { useDocStore } from '@/store/useDocStore';
import { getTool } from '@/tools/registry';
import { toolContext } from '@/tools/context';
import type { ToolPointerEvent } from '@/tools/types';
import { isAncestorOrSelf, type Vec } from '@/model';
import { isMac } from '@/actions/registry';
import { SceneLayer } from './SceneLayer';
import { SelectionOverlay } from './overlays/SelectionOverlay';
import { HoverOverlay } from './overlays/HoverOverlay';
import { GuidesOverlay } from './overlays/GuidesOverlay';
import { IconKeylinesOverlay } from '@/iconMode/canvas/KeylinesOverlay';
import { Rulers } from './overlays/Rulers';
import { CanvasContextMenu } from './CanvasContextMenu';
import { useContextMenu } from './contextMenuStore';
import { KnockoutPanel } from '@/vector/KnockoutPanel';

type PanDrag = { pointerId: number; start: Vec; pan: Vec };
type Pinch = { dist: number; mid: Vec; zoom: number; pan: Vec };

const ed = () => useEditorStore.getState();

/**
 * The canvas: renders the scene with the view transform, routes pointer input to the active
 * tool in document coordinates, and handles zoom (wheel, pinch, keys) and pan (Space-drag,
 * middle mouse, two fingers, trackpad scroll).
 */
export function CanvasView() {
  const ref = useRef<HTMLDivElement>(null);
  const toolId = useEditorStore((s) => s.tool);
  const cursor = useEditorStore((s) => s.cursor);
  const spacePan = useEditorStore((s) => s.spacePan);
  const tool = getTool(toolId);
  const ToolOverlay = tool?.Overlay;

  const pointers = useRef(new Map<number, Vec>());
  const panDrag = useRef<PanDrag | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const toolPointer = useRef<number | null>(null);
  // Chrome reports detail=0 on pointerdown, so count clicks ourselves (double-click detection).
  const lastDown = useRef<{ t: number; p: Vec; count: number } | null>(null);

  // Track viewport size; fit the artboard the first time we know it.
  useEffect(() => {
    const el = ref.current!;
    let fitted = false;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      ed().setViewport({ width, height });
      if (!fitted && width > 0 && height > 0) {
        fitted = true;
        const ab = useDocStore.getState().doc.artboard;
        ed().fitRect({ x: 0, y: 0, width: ab.width, height: ab.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel: pinch-zoom (ctrlKey on trackpads) / Cmd+wheel zooms, plain scroll pans. Needs a non-passive listener.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const s = ed();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
        s.setZoom(s.zoom * factor, anchor);
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        s.setPan({ x: s.pan.x - dx, y: s.pan.y - dy });
      }
    };
    // Safari trackpad pinch.
    const onGesture = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGesture);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGesture);
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }): Vec => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const toToolEvent = (e: React.PointerEvent, pressed: boolean): ToolPointerEvent => {
    const screen = local(e);
    return {
      point: ed().screenToDoc(screen),
      screen,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: isMac ? e.metaKey : e.ctrlKey,
      button: e.button,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      pressure: e.pressure,
      detail: e.detail,
      pressed,
    };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    pinch.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: ed().zoom,
      pan: ed().pan,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Focus the canvas so keyboard shortcuts don't go to a previously focused input.
    (document.activeElement as HTMLElement | null)?.blur?.();
    ref.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));

    if (e.pointerType === 'touch' && pointers.current.size === 2) {
      // Second finger: abandon the tool gesture and pinch/pan instead.
      if (toolPointer.current !== null) tool?.onCancel?.(toolContext);
      toolPointer.current = null;
      startPinch();
      return;
    }
    if (pointers.current.size > 1) return;

    if (e.button === 1 || ed().spacePan) {
      panDrag.current = { pointerId: e.pointerId, start: local(e), pan: ed().pan };
      ed().setCursor('grabbing');
      return;
    }
    if (e.button !== 0) return;
    toolPointer.current = e.pointerId;
    const p = local(e);
    const prev = lastDown.current;
    const repeat = prev && e.timeStamp - prev.t < 500 && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < 6;
    lastDown.current = { t: e.timeStamp, p, count: repeat ? prev.count + 1 : 1 };
    tool?.onPointerDown?.({ ...toToolEvent(e, true), detail: Math.max(e.detail, lastDown.current.count) }, toolContext);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    ed().setPointer(ed().screenToDoc(p));

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = pinch.current;
      const zoom = Math.min(64, Math.max(0.02, (g.zoom * dist) / g.dist));
      const k = zoom / g.zoom;
      // Keep the document point under the initial midpoint under the current midpoint.
      useEditorStore.setState({ zoom, pan: { x: mid.x - (g.mid.x - g.pan.x) * k, y: mid.y - (g.mid.y - g.pan.y) * k } });
      return;
    }
    if (panDrag.current?.pointerId === e.pointerId) {
      const d = panDrag.current;
      ed().setPan({ x: d.pan.x + p.x - d.start.x, y: d.pan.y + p.y - d.start.y });
      return;
    }
    const pressed = toolPointer.current === e.pointerId;
    if (!pressed && pointers.current.size > 0) return;
    tool?.onPointerMove?.(toToolEvent(e, pressed), toolContext);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    if (panDrag.current?.pointerId === e.pointerId) {
      panDrag.current = null;
      ed().setCursor(ed().spacePan ? 'grab' : (tool?.cursor ?? 'default'));
      return;
    }
    if (toolPointer.current === e.pointerId) {
      toolPointer.current = null;
      tool?.onPointerUp?.(toToolEvent(e, false), toolContext);
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (toolPointer.current === e.pointerId) {
      toolPointer.current = null;
      tool?.onCancel?.(toolContext);
    }
    panDrag.current = null;
    if (pointers.current.size < 2) pinch.current = null;
  };

  // Right-click: select what is under the pointer (unless already selected), then show the menu.
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (ed().editingTextId) return;
    const p = local(e);
    const hit = toolContext.hitTest(ed().screenToDoc(p));
    const sel = ed().selection;
    if (hit && !sel.includes(hit) && !sel.some((id) => isAncestorOrSelf(useDocStore.getState().doc, hit, id))) ed().setSelection([hit]);
    else if (!hit && !e.shiftKey) ed().clearSelection();
    useContextMenu.getState().set({ x: e.clientX, y: e.clientY });
  };

  const onPointerLeave = () => {
    ed().setPointer(null);
    if (toolPointer.current === null) ed().setHover(null);
  };

  return (
    <>
      <div
        ref={ref}
        data-slot="canvas"
        className="relative size-full touch-none overflow-hidden bg-muted select-none"
        style={{ cursor: spacePan && cursor !== 'grabbing' ? 'grab' : cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onContextMenu={onContextMenu}
      >
        <svg className="absolute inset-0 size-full" role="img" aria-label="Canvas">
          <SceneLayer />
        </svg>
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <IconKeylinesOverlay />
          <HoverOverlay />
          <SelectionOverlay />
          <GuidesOverlay />
          {ToolOverlay && <ToolOverlay />}
        </svg>
        <Rulers />
        <KnockoutPanel />
      </div>
      {/* Outside the canvas element: React events from the portaled menu must not reach its pointer handlers. */}
      <CanvasContextMenu />
    </>
  );
}
