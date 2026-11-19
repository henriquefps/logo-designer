import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from '@/canvas/overlays/useView';
import { frameRect } from '../screens';
import { useFlowStore } from '../flowCommands';
import { FLOW_HANDLE_RADIUS_PX, flowHandlePoint, flowHandleSource } from '../flowDrag';
import { isScreenNode, worldBounds } from '@/model';
import { LayoutDropOverlay } from './LayoutDropOverlay';
import { arrowHead } from './arrowHead';

/** The select tool's wireframe overlay: the stack insertion line, the flow handle and the flow being drawn. */
export function SelectWireframeOverlay() {
  return (
    <>
      <LayoutDropOverlay />
      <FlowHandle />
      <FlowDragPreview />
    </>
  );
}

/** The small circle right of a selected element inside a screen: drag it to draw a flow. */
function FlowHandle() {
  const doc = useDocStore((s) => s.doc);
  useEditorStore((s) => s.selection);
  const dragging = useFlowStore((s) => !!s.drag);
  const { toScreen, zoom } = useView();
  const ctx = { doc: () => doc, editor: () => useEditorStore.getState() };
  const id = flowHandleSource(ctx);
  if (!id || dragging) return null;
  const p = flowHandlePoint(ctx, id, zoom);
  const r = worldBounds(doc, id);
  if (!p || !r) return null;
  const c = toScreen(p);
  const edge = toScreen({ x: r.x + r.width, y: p.y });
  return (
    <g data-slot="flow-handle" pointerEvents="none">
      <line x1={edge.x} y1={edge.y} x2={c.x - FLOW_HANDLE_RADIUS_PX} y2={c.y} className="stroke-primary" strokeWidth={1} />
      <circle cx={c.x} cy={c.y} r={FLOW_HANDLE_RADIUS_PX} className="fill-background stroke-primary" strokeWidth={1.5} />
      <path d={arrowHead({ x: c.x + 3, y: c.y }, { x: 1, y: 0 }, 6)} className="fill-primary" />
    </g>
  );
}

/** While dragging from the handle: a dashed line to the pointer and the screen it would link to. */
function FlowDragPreview() {
  const drag = useFlowStore((s) => s.drag);
  const doc = useDocStore((s) => s.doc);
  const { toScreen, zoom } = useView();
  if (!drag) return null;
  const a = toScreen(drag.start);
  const b = toScreen(drag.point);
  const frame = drag.overFrame ? doc.children.find((n) => n.id === drag.overFrame) : null;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  return (
    <g data-slot="flow-drag" pointerEvents="none">
      {frame && isScreenNode(frame) && (() => {
        const r = frameRect(frame);
        const tl = toScreen(r);
        return <rect x={tl.x} y={tl.y} width={r.width * zoom} height={r.height * zoom} fill="none" className="stroke-primary" strokeWidth={2} />;
      })()}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-primary" strokeWidth={1.5} strokeDasharray="5 4" />
      <path d={arrowHead(b, dir)} className="fill-primary" />
    </g>
  );
}
