// Flows from parts of a component (docs/wireframe-mode.md → Links from parts of a component → Reorder/rename
// safety): when a list prop of an instance changes (its tabs reordered, one renamed or removed), the flows on its
// parts follow their items (`remapPartKey`), in the same undo step. Instance flows compare the node before and
// after the change; shared flows (defined in a master) compare the master's content. Runs after `symbols` (420),
// which writes an edit made through an instance into its master, and before `autoSelect` (430).
import type { Draft } from 'immer';
import { walk, type DesignDocument, type GroupNode, type Id, type SceneNode, type WireframeFlow, type WireframeSymbol } from '@/model';
import { remapPartKey } from '../../flows';
import { getComponent } from '../../library/registry';
import { plain, type PipelineContext, type WireframeStep } from '../../types';

const component = (n: SceneNode | null | undefined) => (n && n.type === 'group' && n.component ? n.component : null);

function masterNode(symbols: readonly WireframeSymbol[] | undefined, symbol: Id, id: Id): SceneNode | null {
  const s = (symbols ?? []).find((x) => x.id === symbol);
  if (!s) return null;
  let found: SceneNode | null = null;
  walk([s.content as GroupNode], (n) => {
    if (found) return false;
    if (n.id === id) found = n;
  });
  return found;
}

/** The new key of each part flow whose component's props changed (null = remove), by flow index. */
export function partFlowChanges(doc: DesignDocument, ctx: Pick<PipelineContext, 'before' | 'previous'>): Map<number, string | null> {
  const out = new Map<number, string | null>();
  const flows = doc.wireframe?.flows ?? [];
  if (!ctx.before || !flows.some((f) => f.part !== undefined)) return out;
  let ids: Map<Id, SceneNode> | null = null;
  const now = (id: Id) => {
    if (!ids) {
      ids = new Map();
      walk(doc.children, (n) => void ids!.set(n.id, n));
    }
    return ids.get(id) ?? null;
  };
  flows.forEach((f: WireframeFlow, i) => {
    if (f.part === undefined) return;
    const after = component(f.symbol ? masterNode(doc.wireframe!.symbols, f.symbol, f.from) : now(f.from));
    const prev = component(f.symbol ? masterNode(ctx.before!.wireframe?.symbols, f.symbol, f.from) : ctx.previous(f.from));
    if (!after || !prev || after.props === prev.props || after.kind !== prev.kind) return;
    const def = getComponent(after.kind);
    if (!def?.partLists) return;
    const key = remapPartKey(def, prev.props, after.props, f.part);
    if (key !== f.part) out.set(i, key);
  });
  return out;
}

const step: WireframeStep = {
  id: 'partFlows',
  order: 425,
  phases: ['settle'],
  run(d: Draft<DesignDocument>, ctx) {
    if (!d.wireframe?.flows?.length) return;
    const changes = partFlowChanges(plain(d) as DesignDocument, ctx);
    if (!changes.size) return;
    const flows = d.wireframe.flows;
    for (const i of [...changes.keys()].sort((a, b) => b - a)) {
      const key = changes.get(i);
      if (key === null) flows.splice(i, 1);
      else if (key !== undefined) flows[i].part = key;
    }
    if (!flows.length) delete d.wireframe.flows;
  },
};

export default step;
