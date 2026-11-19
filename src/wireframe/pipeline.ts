// The wireframe materialization pipeline (docs/architecture.md → Wireframe mode).
//
// Wireframe documents store everything materialized: component children, layout transforms and
// screen heights are real nodes and numbers in the document, so rendering, bounds, hit testing,
// export and the CLI need no special cases. The pipeline is what keeps them up to date: after every
// change to a wireframe document, `useDocStore` runs the registered steps on the result, inside the
// same undo step (their patches are appended to the change's patches). Logo and app icon documents
// never reach a step.
//
// Steps live in `src/wireframe/steps/<id>/index.ts` (discovered, see ./steps/registry.ts) and run
// in `order`:
//   50  adopt       (settle only) objects dropped onto a screen become its children, and leave it
//                   when dragged out
//  100  components  rebuilds component instances whose `component` (kind, props, size) changed
//  400  resize      a flow child the user resized gets that dimension fixed (`layoutItem`)
//  450  repeat      copies of a repeating container's first child (../repeat.ts)
//  500  layout      stacks / grids (../layout.ts): child transforms, container sizes, frame heights
//  900  screens     logical screens ↔ frames, one frame per platform, frame height = max(min, content)
//  950  flows       (settle, load) flows whose source element or target screen is gone are removed
//
// Pure: no React, no stores; the CLI runs it too (`designer new --preset wireframe`, `screen`, load).
import { enablePatches, produce, produceWithPatches, type Draft } from 'immer';
import { walk, type DesignDocument, type Id, type SceneNode } from '@/model';
import { getSteps } from './steps/registry';
import { plain, type PipelineContext, type PipelinePhase, type PipelineResult, type WireframeStep } from './types';

enablePatches();

export type { PipelineContext, PipelinePhase, PipelineResult, WireframeStep } from './types';
export { plain } from './types';

function previousLookup(before: DesignDocument | null): (id: Id) => SceneNode | null {
  if (!before) return () => null;
  let map: Map<Id, SceneNode> | null = null;
  return (id) => {
    if (!map) {
      map = new Map();
      walk(before.children, (n) => void map!.set(n.id, n));
    }
    return map.get(id) ?? null;
  };
}

/**
 * Runs the steps for `phase` on `doc`. Returns null when `doc` is not a wireframe document or no
 * step changed anything; otherwise the new document (and the patches, unless `patches: false`).
 */
export function runWireframePipeline(
  doc: DesignDocument,
  before: DesignDocument | null,
  phase: PipelinePhase,
  opts: { patches?: boolean; steps?: readonly WireframeStep[] } = {},
): PipelineResult | null {
  if (!doc.wireframe) return null;
  const steps = (opts.steps ?? getSteps()).filter((s) => !s.phases || s.phases.includes(phase));
  if (!steps.length) return null;
  const ctx: PipelineContext = {
    phase,
    before,
    input: doc,
    previous: previousLookup(before),
    differs: (value, prev) => plain(value) !== prev,
  };
  const recipe = (d: Draft<DesignDocument>) => {
    for (const step of steps) step.run(d, ctx);
  };
  if (opts.patches === false) {
    const next = produce(doc, recipe);
    return next === doc ? null : { doc: next, patches: [], inverse: [] };
  }
  const [next, patches, inverse] = produceWithPatches(doc, recipe);
  return patches.length ? { doc: next, patches, inverse } : null;
}

/** The document with every step's `load` work done (or the same document). For code that creates or reads files. */
export function materializeDocument(doc: DesignDocument): DesignDocument {
  return runWireframePipeline(doc, null, 'load', { patches: false })?.doc ?? doc;
}
