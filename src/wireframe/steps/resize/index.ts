// Resizing a child inside a stack (its `component.size` / `layout.size` changed by the user: resize
// handles, W/H fields) turns that dimension into a fixed size (`layoutItem.width/height = number`).
// Its own step, before `repeat` (450) and `layout` (500), so a resized repeat template is copied with
// its new sizing and the layout places everything in one run.
import type { Draft } from 'immer';
import { nodeAxes, type LayoutItemInfo, type SceneNode } from '@/model';
import { itemSizing } from '../../layout';
import type { PipelineContext, WireframeStep } from '../../types';

type Path = number[];

function at(d: Draft<{ children: SceneNode[] }>, path: Path): Draft<SceneNode> {
  let list = d.children as Draft<SceneNode>[];
  let node!: Draft<SceneNode>;
  for (const i of path) {
    node = list[i];
    list = node.type === 'group' ? (node.children as Draft<SceneNode>[]) : [];
  }
  return node;
}

/** A frame with a layout, or a stack / grid. */
const lays = (n: SceneNode) => n.type === 'group' && !!n.layout && !n.component;

const boxOf = (n: SceneNode): { width: number; height: number } | undefined =>
  n.type === 'group' ? (n.component?.size ?? (n.screen ? undefined : n.layout?.size)) : undefined;

/** Flow children the user resized become fixed in the dimension that changed. Repeat copies follow their template. */
function resizedToFixed(nodes: readonly SceneNode[], ctx: PipelineContext, path: Path, out: { path: Path; item: LayoutItemInfo }[]) {
  nodes.forEach((n, i) => {
    if (n.type !== 'group' || n.component || n.repeatCopy || ctx.previous(n.id) === n) return;
    if (lays(n)) {
      n.children.forEach((c, j) => {
        const prev = ctx.previous(c.id);
        if (!prev || prev === c || c.repeatCopy || itemSizing(c).position === 'free') return;
        const now = boxOf(c);
        // Only a node the user changed: its layoutItem was replaced (a gesture frame re-applies the snapshot's; this
        // step fixed it in an earlier frame), or, outside the commit of a gesture, its box differs from the last
        // output. A stack or card that only reflowed around a resized child has neither, and keeps hugging.
        const last = boxOf(prev);
        const replaced = c.layoutItem !== (prev as SceneNode & { layoutItem?: unknown }).layoutItem;
        const resized = !now || !last || Math.abs(now.width - last.width) > 0.5 || Math.abs(now.height - last.height) > 0.5;
        const touched = replaced || (!ctx.committing && resized);
        if (!touched) return;
        // Against the gesture's start, not the last frame: every frame re-applies the snapshot's layoutItem,
        // so a frame that doesn't change the size must still keep what the gesture's total change fixed.
        const was = boxOf(ctx.atGestureStart(c.id) ?? prev);
        if (!now || !was) return;
        const item: LayoutItemInfo = { ...c.layoutItem };
        let changed = false;
        // Only axes the component can be sized in become fixed (the others follow the content).
        const axes = nodeAxes(c);
        if (axes.width && Math.abs(now.width - was.width) > 0.5) {
          item.width = Math.round(now.width * 100) / 100;
          changed = true;
        }
        if (axes.height && Math.abs(now.height - was.height) > 0.5) {
          item.height = Math.round(now.height * 100) / 100;
          changed = true;
        }
        if (changed) out.push({ path: [...path, i, j], item });
      });
    }
    resizedToFixed(n.children, ctx, [...path, i], out);
  });
}

const step: WireframeStep = {
  id: 'resize',
  order: 400,
  phases: ['change', 'settle'],
  run(d, ctx) {
    const fixes: { path: Path; item: LayoutItemInfo }[] = [];
    resizedToFixed(ctx.input.children, ctx, [], fixes);
    for (const f of fixes) at(d, f.path).layoutItem = f.item;
  },
};

export default step;
