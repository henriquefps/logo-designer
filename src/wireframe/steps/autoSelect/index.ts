// Selected item follows the screen (docs/wireframe-mode.md → Links from parts of a component): a navigation
// component whose `selected` is `'auto'` draws selected the item whose part opens the screen it is on (the first
// one when none does). The value is stored in `component.resolved` (per instance: never shared between instances
// of a shared component) and the instance is rebuilt. Runs after `symbols` (420; an instance's content may have just
// been rewritten from its master) and before `repeat` (450) and `layout` (500), which rebuilds laid-out instances
// whose `component` changed; instances no layout places are rebuilt here.
import type { Draft } from 'immer';
import type { ComponentNode, DesignDocument, Id, SceneNode } from '@/model';
import { flowsAt } from '../../flows';
import { getComponent } from '../../library/registry';
import { autoProps, isAutoProp, resolveProps } from '../../library/types';
import { frameOf } from '../../screens';
import { plain, type PipelineContext, type WireframeStep } from '../../types';
import { buildComponentInto } from '../components';

type Path = number[];

/** What `resolved` should be for instance `id` (undefined: nothing to resolve, the default applies). */
export function resolvedFor(doc: DesignDocument, id: Id, n: ComponentNode): Record<string, number> | undefined {
  const def = getComponent(n.component.kind);
  if (!def?.selectFromPart) return undefined;
  const keys = autoProps(def).filter((k) => isAutoProp(def, n.component.props, k));
  if (!keys.length) return undefined;
  const frame = frameOf(doc, id);
  if (!frame) return undefined;
  const props = resolveProps(def, n.component.props);
  let best: number | null = null;
  for (const f of flowsAt(doc, id)) {
    if (f.part === undefined || f.to !== frame.screen.screenId) continue;
    const v = def.selectFromPart(props, f.part);
    if (v !== null && (best === null || v < best)) best = v;
  }
  if (best === null) return undefined;
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = best;
  return out;
}

const same = (a: Record<string, number> | undefined, b: Record<string, number> | undefined) =>
  a === b || (!!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]));

function at(d: Draft<{ children: SceneNode[] }>, path: Path): Draft<SceneNode> {
  let list = d.children as Draft<SceneNode>[];
  let node!: Draft<SceneNode>;
  for (const i of path) {
    node = list[i];
    list = node.type === 'group' ? (node.children as Draft<SceneNode>[]) : [];
  }
  return node;
}

/** Instances with an `auto` prop, by path; `all` = every subtree, else only those the change touched. */
function candidates(nodes: readonly SceneNode[], ctx: PipelineContext, all: boolean, path: Path, parentLays: boolean, out: { path: Path; node: ComponentNode; laid: boolean }[]) {
  nodes.forEach((n, i) => {
    if (n.type !== 'group') return;
    if (!all && ctx.previous(n.id) === n) return;
    const p = [...path, i];
    if (n.component) {
      const def = getComponent(n.component.kind);
      if (def?.selectFromPart || n.component.resolved) out.push({ path: p, node: n as ComponentNode, laid: parentLays && n.layoutItem?.position !== 'free' });
      return;
    }
    candidates(n.children, ctx, all, p, !!n.layout, out);
  });
}

const step: WireframeStep = {
  id: 'autoSelect',
  order: 430,
  run(d, ctx) {
    const doc = plain(d) as DesignDocument;
    if (!doc.wireframe) return;
    // Flows decide what is selected: when they changed, every instance is looked at.
    const all = ctx.phase === 'load' || ctx.before?.wireframe?.flows !== doc.wireframe.flows || ctx.before?.wireframe?.screens !== doc.wireframe.screens;
    const found: { path: Path; node: ComponentNode; laid: boolean }[] = [];
    candidates(doc.children, ctx, all, [], false, found);
    for (const { path, node, laid } of found) {
      const want = resolvedFor(doc, node.id, node);
      if (same(want, node.component.resolved)) continue;
      const draft = at(d, path) as Draft<ComponentNode>;
      if (want) draft.component.resolved = want;
      else delete draft.component.resolved;
      if (!laid) buildComponentInto(draft, node.component.size);
    }
  },
};

export default step;
