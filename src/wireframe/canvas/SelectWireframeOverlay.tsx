import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from '@/canvas/overlays/useView';
import { frameRect } from '../screens';
import { useFlowStore } from '../flowCommands';
import { FLOW_HANDLE_RADIUS_PX, flowHandlePoint, flowHandleSource, partHandlePoint, partSource } from '../flowDrag';
import { partLabel } from '../flows';
import { isScreenNode, worldBounds } from '@/model';
import { LayoutDropOverlay } from './LayoutDropOverlay';
import { arrowHead } from './arrowHead';

/** The select tool's wireframe overlay: the stack insertion line, the flow handle and the flow being drawn. */
export function SelectWireframeOverlay() {
  return (
    <>
      <LayoutDropOverlay />
      <FlowHandle />
      <PartHandle />
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

/**
 * The part of the selected instance under the pointer (a bottom navigation item): a dashed outline, its label and its
 * own flow handle (drag it to link that part). Also drawn while a flow is dragged from a part.
 */
function PartHandle() {
  const doc = useDocStore((s) => s.doc);
  useEditorStore((s) => s.selection);
  const hover = useFlowStore((s) => s.hoverPart);
  const drag = useFlowStore((s) => s.drag);
  const { toScreen, zoom } = useView();
  const ctx = { doc: () => doc, editor: () => useEditorStore.getState() };
  const target = drag?.part !== undefined ? { nodeId: drag.fromId, key: drag.part } : hover && partSource(ctx) === hover.nodeId ? hover : null;
  if (!target) return null;
  const h = partHandlePoint(ctx, target.nodeId, target.key);
  if (!h) return null;
  const tl = toScreen({ x: h.rect.x, y: h.rect.y });
  const c = toScreen(h.point);
  const label = partLabel(doc, target.nodeId, target.key);
  const w = Math.ceil(label.length * 6.4) + 12;
  const top = h.point.y === h.rect.y;
  // The label sits clear of the handle: under the part when the handle is on its top edge, else above it.
  const labelX = top ? tl.x + (h.rect.width * zoom - w) / 2 : tl.x;
  const labelY = top ? tl.y + h.rect.height * zoom + 4 : tl.y - 22;
  return (
    <g data-slot="part-handle" data-part={target.key} pointerEvents="none">
      <rect x={tl.x} y={tl.y} width={h.rect.width * zoom} height={h.rect.height * zoom} rx={3} className="fill-primary/10 stroke-primary" strokeWidth={1.5} strokeDasharray="4 3" />
      {!drag && (
        <g fontSize={11} fontFamily="var(--font-sans, Inter, sans-serif)">
          <rect x={labelX} y={labelY} width={w} height={18} rx={9} className="fill-primary" />
          <text x={labelX + w / 2} y={labelY + 13} textAnchor="middle" className="fill-primary-foreground">
            {label}
          </text>
        </g>
      )}
      {!drag && (
        <>
          <circle cx={c.x} cy={c.y} r={FLOW_HANDLE_RADIUS_PX} className="fill-background stroke-primary" strokeWidth={1.5} />
          <path d={arrowHead(top ? { x: c.x, y: c.y - 3 } : { x: c.x + 3, y: c.y }, top ? { x: 0, y: -1 } : { x: 1, y: 0 }, 6)} className="fill-primary" />
        </>
      )}
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
