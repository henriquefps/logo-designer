import { localBounds, matrixToSvg, multiply, nodeToSvgPath, rectCorners, findNode, worldMatrix, apply } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from './useView';

/** Outline of the hovered node (actual shape for vector nodes, box for others). */
export function HoverOverlay() {
  const doc = useDocStore((s) => s.doc);
  const hover = useEditorStore((s) => s.hover);
  const selected = useEditorStore((s) => (hover ? s.selection.includes(hover) : false));
  const { matrix } = useView();
  if (!hover || selected) return null;
  const node = findNode(doc, hover);
  if (!node) return null;
  const m = multiply(matrix, worldMatrix(doc, hover));
  const d = nodeToSvgPath(node);
  if (d) {
    return <path d={d} transform={matrixToSvg(m)} fill="none" stroke="var(--primary)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
  }
  const lb = localBounds(node);
  if (!lb) return null;
  const pts = rectCorners(lb).map((p) => apply(m, p));
  return <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth={1.5} pointerEvents="none" />;
}
