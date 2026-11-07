import { apply, findNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from '@/canvas/overlays/useView';
import { Anchor, Handle, PathOutline } from '@/vector/overlay';
import { nodeScreenMatrix } from '@/vector/geometry';
import { anchorKey } from '@/vector/pathEdit';
import { visibleHandles } from './handles';
import { useNodeEdit } from './state';

/** Node edit: outline, every anchor (filled when selected) and the handles around the selection. */
export function DirectOverlay() {
  const doc = useDocStore((s) => s.doc);
  const editingId = useEditorStore((s) => s.editingPathId);
  const selected = useNodeEdit((s) => s.selected);
  const view = useView();
  const node = editingId ? findNode(doc, editingId) : null;
  if (!node || node.type !== 'path') return null;
  const m = nodeScreenMatrix(doc, node.id, view.matrix);
  const s = (p: { x: number; y: number }) => apply(m, p);
  const sel = new Set(selected);
  return (
    <g pointerEvents="none">
      <PathOutline subpaths={node.subpaths} m={m} />
      {visibleHandles(node.subpaths, selected).map((h) => {
        const p = node.subpaths[h.ref.s].points[h.ref.i];
        return <Handle key={`${anchorKey(h.ref)}:${h.which}`} anchor={s(p)} handle={s(p[h.which]!)} />;
      })}
      {node.subpaths.map((sp, si) =>
        sp.points.map((p, i) => (
          <Anchor key={`${si}:${i}`} p={s(p)} selected={sel.has(anchorKey({ s: si, i }))} smooth={p.type !== 'corner'} />
        )),
      )}
    </g>
  );
}
