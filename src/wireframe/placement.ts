// Where new content goes (paste, import, icons, fonts…). Logo and icon documents: the artboard.
// Wireframe documents have no artboard: the screen of the selection (its visible part), else the
// visible part of the canvas.
import { rectFromCorners, type Rect } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { frameOf, frameRect } from './screens';
import { fitTarget } from './view';

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const btm = Math.min(a.y + a.height, b.y + b.height);
  return r > x && btm > y ? { x, y, width: r - x, height: btm - y } : null;
}

export function placementArea(): Rect {
  const doc = useDocStore.getState().doc;
  if (!doc.wireframe) return { x: 0, y: 0, width: doc.artboard.width, height: doc.artboard.height };
  const ed = useEditorStore.getState();
  const { width, height } = ed.viewport;
  const view = width > 0 && height > 0 ? rectFromCorners(ed.screenToDoc({ x: 0, y: 0 }), ed.screenToDoc({ x: width, y: height })) : null;
  for (const id of ed.selection) {
    const f = frameOf(doc, id);
    if (!f) continue;
    const r = frameRect(f);
    return (view && intersect(r, view)) ?? r;
  }
  return view ?? fitTarget(doc);
}
