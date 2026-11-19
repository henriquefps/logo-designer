// Repeat (docs/wireframe-mode.md → R4, ../../repeat.ts): containers with `layout.repeat` get
// `count − 1` copies of their first child; copies whose container no longer repeats (or whose
// template is gone) are removed. Runs after `resize` (400, so a resized template is copied with its
// new sizing) and before `layout` (500, which places and sizes the copies like any child).
// Bottom-up, so a nested repeat inside a template is complete before the template is copied; never
// inside a copy (copies are clones, already complete).
import type { Draft } from 'immer';
import type { GroupNode, SceneNode } from '@/model';
import { repeatChildren } from '../../repeat';
import { plain, type PipelineContext, type WireframeStep } from '../../types';

type Path = number[];

function at(d: Draft<{ children: SceneNode[] }>, path: Path): Draft<GroupNode> {
  let list = d.children as Draft<SceneNode>[];
  let node!: Draft<SceneNode>;
  for (const i of path) {
    node = list[i];
    list = node.type === 'group' ? (node.children as Draft<SceneNode>[]) : [];
  }
  return node as Draft<GroupNode>;
}

/** Groups to sync, children before parents. Skips untouched subtrees, instances and copies. */
function collect(nodes: readonly SceneNode[], ctx: PipelineContext, path: Path, out: Path[]) {
  nodes.forEach((n, i) => {
    if (n.type !== 'group' || n.component || n.repeatCopy) return;
    if (ctx.phase !== 'load' && ctx.previous(n.id) === n) return;
    const p = [...path, i];
    collect(n.children, ctx, p, out);
    if (n.layout?.repeat || n.children.some((c) => c.repeatCopy)) out.push(p);
  });
}

/** Writes `next` (plain nodes) as the children of `draft`, reusing the draft children that did not change. */
function writeChildren(draft: Draft<{ children: SceneNode[] }>, was: readonly SceneNode[], next: SceneNode[]) {
  const reuse = new Map(was.map((n, i) => [n, draft.children[i]]));
  draft.children = next.map((n) => reuse.get(n) ?? (n as Draft<SceneNode>));
}

const step: WireframeStep = {
  id: 'repeat',
  order: 450,
  run(d, ctx) {
    const snapshot = plain(d);
    // A copy on the canvas itself (pasted on its own) is not a copy of anything.
    if (snapshot.children.some((n) => n.repeatCopy)) {
      writeChildren(d, snapshot.children, snapshot.children.filter((n) => !n.repeatCopy));
    }
    const paths: Path[] = [];
    collect(plain(d).children, ctx, [], paths);
    for (const p of paths) {
      const draft = at(d, p);
      const node = plain(draft) as GroupNode;
      const next = repeatChildren(node);
      if (next) writeChildren(draft, node.children, next);
    }
  },
};

export default step;
