// Stacks and grids (docs/wireframe-mode.md → Layout): lays out every container whose subtree
// changed (all of them on load) with the pure ../../layout.ts, and writes the frame height of
// screens whose content is a stack. Runs after `components` (instances are built) and before
// `screens` (which only enforces the platform minimum for frames with a layout).
//
// - While a gesture runs (`change` phase), a flow child the user is dragging is not snapped back
//   into place (it follows the pointer); it lands when the gesture settles.
// - Resizing a child inside a stack (its `component.size` / `layout.size` changed by the user)
//   turns that dimension into a fixed size (`layoutItem.width/height = number`).
import type { Draft } from 'immer';
import { isScreenNode, platformDef, type ComponentNode, type LayoutItemInfo, type SceneNode, type ScreenNode } from '@/model';
import { applyLayout, isLayoutContainer, itemSizing, rootBox, type ContainerNode, type LayoutEnv } from '../../layout';
import { plain, type PipelineContext, type WireframeStep } from '../../types';
import { buildComponentInto } from '../components';

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
const lays = (n: SceneNode): n is ContainerNode => n.type === 'group' && !!n.layout && !n.component;

const boxOf = (n: SceneNode): { width: number; height: number } | undefined =>
  n.type === 'group' ? (n.component?.size ?? (n.screen ? undefined : n.layout?.size)) : undefined;

/** Flow children the user resized become fixed in the dimension that changed. */
function resizedToFixed(nodes: readonly SceneNode[], ctx: PipelineContext, path: Path, out: { path: Path; item: LayoutItemInfo }[]) {
  nodes.forEach((n, i) => {
    if (n.type !== 'group' || n.component || ctx.previous(n.id) === n) return;
    if (lays(n)) {
      n.children.forEach((c, j) => {
        const prev = ctx.previous(c.id);
        if (!prev || prev === c || itemSizing(c).position === 'free') return;
        const now = boxOf(c);
        const was = boxOf(prev);
        if (!now || !was) return;
        const item: LayoutItemInfo = { ...c.layoutItem };
        let changed = false;
        if (Math.abs(now.width - was.width) > 0.5) {
          item.width = Math.round(now.width * 100) / 100;
          changed = true;
        }
        if (Math.abs(now.height - was.height) > 0.5) {
          item.height = Math.round(now.height * 100) / 100;
          changed = true;
        }
        if (changed) out.push({ path: [...path, i, j], item });
      });
    }
    resizedToFixed(n.children, ctx, [...path, i], out);
  });
}

/** Containers to lay out from: changed, and not placed by a parent layout (top level, free, in a free frame). */
function roots(nodes: readonly SceneNode[], ctx: PipelineContext, parentLays: boolean, path: Path, out: Path[]) {
  nodes.forEach((n, i) => {
    if (n.type !== 'group' || n.component) return;
    if (ctx.phase !== 'load' && ctx.previous(n.id) === n) return; // untouched subtree
    const placedByParent = parentLays && itemSizing(n).position !== 'free';
    if (lays(n) && !placedByParent) out.push([...path, i]);
    roots(n.children, ctx, lays(n), [...path, i], out);
  });
}

const step: WireframeStep = {
  id: 'layout',
  order: 500,
  run(d, ctx) {
    if (ctx.phase !== 'load') {
      const fixes: { path: Path; item: LayoutItemInfo }[] = [];
      resizedToFixed(ctx.input.children, ctx, [], fixes);
      for (const f of fixes) at(d, f.path).layoutItem = f.item;
    }
    // Measure a plain snapshot once (the input itself unless an earlier step wrote to the draft).
    const snapshot = plain(d);
    const paths: Path[] = [];
    roots(snapshot.children, ctx, false, [], paths);
    if (!paths.length) return;
    const env: LayoutEnv = {
      build: (node, size) => void buildComponentInto(node as Draft<ComponentNode>, size),
      fresh: (n) => ctx.phase !== 'load' && ctx.previous(n.id) === n,
      built: (n) => {
        if (ctx.phase === 'load') return false;
        const prev = ctx.previous(n.id);
        return !!prev && prev.type === 'group' && n.type === 'group' && prev.component === n.component;
      },
      hold: (n) => {
        if (ctx.phase !== 'change') return false;
        const prev = ctx.previous(n.id);
        return !!prev && prev.transform !== n.transform;
      },
    };
    for (const path of paths) {
      const node = at(snapshot as unknown as Draft<{ children: SceneNode[] }>, path) as unknown as ContainerNode;
      const draft = at(d, path) as Draft<ContainerNode>;
      if (isScreenNode(node)) {
        const min = platformDef(node.screen.platform).minHeight;
        const { height } = applyLayout(draft, node, { width: node.screen.width, minHeight: min, frame: true }, env);
        const h = Math.max(min, Math.ceil(height - 1e-6));
        const f = draft as Draft<ScreenNode>;
        if (f.screen.height !== h) f.screen.height = h;
      } else if (isLayoutContainer(node)) {
        applyLayout(draft, node, rootBox(node), env);
      }
    }
  },
};

export default step;
