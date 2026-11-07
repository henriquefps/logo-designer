import { apply } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useView } from '@/canvas/overlays/useView';
import { Anchor, Handle } from '@/vector/overlay';
import { nodeScreenMatrix } from '@/vector/geometry';
import { usePen } from './state';

/** Path being drawn: anchors, the last point's handles and a preview of the next segment. */
export function PenOverlay() {
  const doc = useDocStore((s) => s.doc);
  const { nodeId, hover, closeHover } = usePen();
  const view = useView();
  const node = nodeId ? useDocStore.getState().findNode(nodeId) : null;
  if (!node || node.type !== 'path' || !doc) return null;
  const sp = node.subpaths[0];
  if (!sp?.points.length) return null;
  const m = nodeScreenMatrix(doc, node.id, view.matrix);
  const s = (p: { x: number; y: number }) => apply(m, p);
  const last = sp.points[sp.points.length - 1];
  const first = sp.points[0];
  let preview: string | null = null;
  if (hover && !sp.closed) {
    const a = s(last);
    const c1 = s(last.out ?? last);
    const end = closeHover ? s(first) : view.toScreen(hover);
    const c2 = closeHover && first.in ? s(first.in) : end;
    preview = `M${a.x} ${a.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
  }
  return (
    <g pointerEvents="none">
      {preview && <path d={preview} fill="none" stroke="var(--primary)" strokeWidth={1} strokeDasharray="4 3" />}
      {last.in && <Handle anchor={s(last)} handle={s(last.in)} />}
      {last.out && <Handle anchor={s(last)} handle={s(last.out)} />}
      {sp.points.map((p, i) => (
        <Anchor key={i} p={s(p)} selected={i === sp.points.length - 1 || (closeHover && i === 0)} />
      ))}
    </g>
  );
}
