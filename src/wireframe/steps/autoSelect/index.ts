// Selected item follows the screen (docs/wireframe-mode.md → Selected item follows the screen): a navigation
// component whose `selected` is `'auto'` draws selected the item whose part opens the screen it is on; when none
// does, the item that opens the nearest screen leading to it (flows walked backwards, breadth first: Settings →
// Server keeps "Settings" selected on Server); ties go to the first such item, and with no path at all, the first
// item. The value is stored in `component.resolved` (per instance: never shared between instances
// of a shared component) and the instance is rebuilt. Runs after `symbols` (420; an instance's content may have just
// been rewritten from its master) and before `repeat` (450) and `layout` (500), which rebuilds laid-out instances
// whose `component` changed; instances no layout places are rebuilt here.
import type { Draft } from 'immer';
import type { ComponentNode, DesignDocument, Id, SceneNode } from '@/model';
import { flowSources, flowsAt, flowsOf } from '../../flows';
import { getComponent } from '../../library/registry';
import { autoProps, isAutoProp, resolveProps } from '../../library/types';
import { frameOf, frames } from '../../screens';
import { plain, type PipelineContext, type WireframeStep } from '../../types';
import { buildComponentInto } from '../components';

type Path = number[];
type DocLike = Pick<DesignDocument, 'children' | 'wireframe'>;

/** For each logical screen, the logical screens with a flow (from any element or part on one of their frames) to it. */
export function screenGraph(doc: DocLike): Map<Id, Set<Id>> {
  const screenOf = new Map<Id, Id>();
  const visit = (n: SceneNode, screen: Id) => {
    screenOf.set(n.id, screen);
    if (n.type === 'group') for (const c of n.children) visit(c, screen);
  };
  for (const f of frames(doc)) visit(f, f.screen.screenId);
  const incoming = new Map<Id, Set<Id>>();
  for (const flow of flowsOf(doc)) {
    for (const src of flowSources(doc, flow)) {
      const from = screenOf.get(src);
      if (from === undefined) continue;
      let set = incoming.get(flow.to);
      if (!set) incoming.set(flow.to, (set = new Set()));
      set.add(from);
    }
  }
  return incoming;
}

/**
 * How many flows away each screen is from opening `target` (0: `target` itself, 1: a screen with a flow to it, …),
 * breadth first over incoming flows; screens with no path are absent. Cycles are safe (each screen is seen once).
 */
export function distancesTo(graph: Map<Id, Set<Id>>, target: Id): Map<Id, number> {
  const dist = new Map<Id, number>([[target, 0]]);
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const from of graph.get(at) ?? []) {
      if (dist.has(from)) continue;
      dist.set(from, dist.get(at)! + 1);
      queue.push(from);
    }
  }
  return dist;
}

/** Memoized `distancesTo` for one document state (one pipeline run). */
export function distanceIndex(doc: DocLike): (target: Id) => Map<Id, number> {
  let graph: Map<Id, Set<Id>> | null = null;
  const cache = new Map<Id, Map<Id, number>>();
  return (target) => {
    let d = cache.get(target);
    if (!d) {
      graph ??= screenGraph(doc);
      cache.set(target, (d = distancesTo(graph, target)));
    }
    return d;
  };
}

/**
 * What `resolved` should be for instance `id` (undefined: nothing to resolve, the default applies). Pass `distances`
 * (from `distanceIndex`) when resolving several instances of the same document.
 */
export function resolvedFor(doc: DesignDocument, id: Id, n: ComponentNode, distances: (target: Id) => Map<Id, number> = distanceIndex(doc)): Record<string, number> | undefined {
  const def = getComponent(n.component.kind);
  if (!def?.selectFromPart) return undefined;
  const keys = autoProps(def).filter((k) => isAutoProp(def, n.component.props, k));
  if (!keys.length) return undefined;
  const frame = frameOf(doc, id);
  if (!frame) return undefined;
  const props = resolveProps(def, n.component.props);
  const dist = distances(frame.screen.screenId);
  // Nearest screen first, then the first item.
  let best: number | null = null;
  let bestDist = Infinity;
  for (const f of flowsAt(doc, id)) {
    if (f.part === undefined) continue;
    const d = dist.get(f.to);
    if (d === undefined || d > bestDist) continue;
    const v = def.selectFromPart(props, f.part);
    if (v === null) continue;
    if (d < bestDist || best === null || v < best) {
      best = v;
      bestDist = d;
    }
  }
  if (best === null) return undefined;
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = best;
  return out;
}

/** The screen graph as a string, to tell whether moving elements between screens changed it. */
const graphKeys = new WeakMap<readonly SceneNode[], { flows: unknown; key: string }>();
function graphKey(doc: DocLike): string {
  const hit = graphKeys.get(doc.children);
  if (hit && hit.flows === doc.wireframe?.flows) return hit.key;
  const key = flowsOf(doc).length
    ? [...screenGraph(doc)]
        .map(([to, from]) => `${to}<${[...from].sort().join(',')}`)
        .sort()
        .join(';')
    : '';
  graphKeys.set(doc.children, { flows: doc.wireframe?.flows, key });
  return key;
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
    // The flows walked backwards also depend on which screen each element is on, so an element moved to another
    // screen (same flows) counts too.
    const all =
      ctx.phase === 'load' ||
      !ctx.before ||
      ctx.before.wireframe?.flows !== doc.wireframe.flows ||
      ctx.before.wireframe?.screens !== doc.wireframe.screens ||
      (ctx.before.children !== doc.children && graphKey(ctx.before) !== graphKey(doc));
    const found: { path: Path; node: ComponentNode; laid: boolean }[] = [];
    candidates(doc.children, ctx, all, [], false, found);
    const distances = distanceIndex(doc);
    for (const { path, node, laid } of found) {
      const want = resolvedFor(doc, node.id, node, distances);
      if (same(want, node.component.resolved)) continue;
      const draft = at(d, path) as Draft<ComponentNode>;
      if (want) draft.component.resolved = want;
      else delete draft.component.resolved;
      if (!laid) buildComponentInto(draft, node.component.size);
    }
  },
};

export default step;
