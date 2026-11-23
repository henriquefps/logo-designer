// The align / distribute buttons (Properties → Align, the select tool's options bar) for any document: nodes a stack
// places are aligned through the layout (./alignInFlow.ts), the others are moved. One undo step, and a toast says why
// when nothing could be done.
import { toast } from 'sonner';
import { alignDeltas, applyWorldMatrix, distributeDeltas, findNode, locate, parentWorldMatrix, translation, type AlignMode, type DistributeMode, type Id, type SceneNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { applyFlowOps, planFlowAlign, planFlowDistribute, type FlowAlignPlan } from './alignInFlow';

const SAID: Record<string, string> = { left: 'Align left', hcenter: 'Align horizontal centers', right: 'Align right', top: 'Align top', vcenter: 'Align vertical centers', bottom: 'Align bottom' };

/** Applies a plan and the usual alignment of its `legacy` nodes in one undo step. */
function run(plan: FlowAlignPlan, legacy: (doc: ReturnType<typeof useDocStore.getState>['doc']) => Map<Id, { x: number; y: number }>, label: string) {
  const { doc } = useDocStore.getState();
  const moved = plan.legacy.length ? legacy(doc) : new Map();
  const nodes = [...moved.entries()]
    .map(([id, v]) => {
      const n = findNode(doc, id);
      return n ? applyWorldMatrix(n, parentWorldMatrix(doc, id), translation(v.x, v.y)) : null;
    })
    .filter((n): n is SceneNode => n !== null);
  if (plan.ops.length || nodes.length) {
    useDocStore.getState().apply(
      (d) => {
        applyFlowOps(d, plan.ops);
        for (const n of nodes) {
          const loc = locate(d, n.id);
          if (loc) (loc.parent.children as SceneNode[])[loc.index] = n;
        }
      },
      { label },
    );
  }
  if (plan.notes.length && !plan.ops.length && !nodes.length) toast(plan.notes[0], plan.notes.length > 1 ? { description: plan.notes.slice(1).join('. ') } : undefined);
  else if (plan.notes.length) toast(plan.notes[0]);
}

/** Align buttons: `toArtboard` is "Align to the artboard / screen" (a single node always is). */
export function alignNodes(ids: Id[], mode: AlignMode, toArtboard: boolean): void {
  const { doc } = useDocStore.getState();
  const plan = planFlowAlign(doc, ids, mode);
  run(plan, (d) => alignDeltas(d, plan.legacy, mode, toArtboard || plan.legacy.length < 2), SAID[mode]);
}

/** Distribute buttons. */
export function distributeNodes(ids: Id[], mode: DistributeMode, toArtboard: boolean): void {
  const { doc } = useDocStore.getState();
  const plan = planFlowDistribute(doc, ids, mode);
  run(plan, (d) => distributeDeltas(d, plan.legacy, mode, toArtboard), mode === 'horizontal' ? 'Distribute horizontally' : 'Distribute vertically');
}
