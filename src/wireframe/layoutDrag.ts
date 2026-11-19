// Dragging objects in and between stacks (docs/wireframe-mode.md → Layout → Editing). The select
// tool's move gesture calls this: while moving, the insertion line shows where the objects land;
// on drop they are moved into that stack at that index (inside the gesture's transaction, so the
// whole drag is one undo step and the layout step places them when it settles).
//
// - A child of a stack dropped elsewhere in a stack: reordered / moved there.
// - An object from the canvas (or a free screen) dropped on a stack: inserted there.
// - Holding ⌘ / Ctrl (`mod`) at the drop: out of every stack, free on the screen under the pointer.
//   Without it, a child of a stack can't become free by accident.
// - Dropped off every stack (on the canvas, on a screen without a layout): it leaves its stack.
// - Free children (position: free) move freely; Properties → Position puts them back in the flow.
import { create } from 'zustand';
import { isScreenNode, locate, topmostIds, type DesignDocument, type Id, type Vec } from '@/model';
import type { DocState } from '@/store/useDocStore';
import { itemSizing } from './layout';
import { dropIndicator, isLaidOut, layoutDropTarget, layoutParent, moveIntoLayout, moveOutOfLayout } from './layoutEdit';

/** The insertion line while dragging (document coordinates), read by the select tool's overlay. */
export const useLayoutDropStore = create<{ line: { a: Vec; b: Vec } | null }>(() => ({ line: null }));

const setLine = (line: { a: Vec; b: Vec } | null) => {
  const cur = useLayoutDropStore.getState().line;
  if (cur === line || (cur && line && cur.a.x === line.a.x && cur.a.y === line.a.y && cur.b.x === line.b.x && cur.b.y === line.b.y)) return;
  useLayoutDropStore.setState({ line });
};

export interface LayoutDrag {
  move(point: Vec, mod: boolean): void;
  /** Applies the drop to the open transaction (call before committing it). */
  drop(): void;
  cancel(): void;
}

const isFreeChild = (doc: DesignDocument, id: Id) => {
  const loc = locate(doc, id);
  return !!loc && !!layoutParent(doc, id) && itemSizing(loc.node).position === 'free';
};

/** True when the screen frame under a point lays out its content. */
function layoutFrameAt(doc: DesignDocument, p: Vec): boolean {
  for (let i = doc.children.length - 1; i >= 0; i--) {
    const n = doc.children[i];
    if (!isScreenNode(n) || !n.visible) continue;
    const { x, y } = n.transform;
    if (p.x >= x && p.x <= x + n.screen.width && p.y >= y && p.y <= y + n.screen.height) return !!n.layout;
  }
  return false;
}

/** Null when the document is not a wireframe or nothing dragged takes part (screen frames, free children only). */
export function startLayoutDrag(store: () => DocState, ids: readonly Id[]): LayoutDrag | null {
  const doc0 = store().doc;
  if (!doc0.wireframe) return null;
  const top = topmostIds(doc0, [...ids]);
  const isFrame = (id: Id) => {
    const n = locate(doc0, id)?.node;
    return !!n && isScreenNode(n);
  };
  if (!top.length || top.some(isFrame)) return null;
  const movers = top.filter((id) => !isFreeChild(doc0, id));
  if (!movers.length) return null;
  const laid = movers.filter((id) => isLaidOut(doc0, id));
  const others = movers.filter((id) => !laid.includes(id));
  let last: { point: Vec; mod: boolean } | null = null;
  return {
    move(point, mod) {
      last = { point, mod };
      if (mod) return setLine(null);
      const doc = store().doc;
      const target = layoutDropTarget(doc, point, { exclude: top });
      setLine(target ? dropIndicator(doc, target, top) : null);
    },
    drop() {
      setLine(null);
      if (!last) return;
      const { point, mod } = last;
      const s = store();
      if (mod) {
        const out = [...laid, ...(layoutFrameAt(s.doc, point) ? others : [])];
        if (out.length) s.apply((d) => moveOutOfLayout(d, out, point));
        return;
      }
      const target = layoutDropTarget(s.doc, point, { exclude: top });
      if (target) s.apply((d) => void moveIntoLayout(d, movers, target));
      else if (laid.length) s.apply((d) => moveOutOfLayout(d, laid, point, { free: false }));
    },
    cancel() {
      setLine(null);
    },
  };
}
