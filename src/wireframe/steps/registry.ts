import type { WireframeStep } from '../types';

// Every pipeline step lives in `src/wireframe/steps/<id>/index.ts` with `export default` a
// WireframeStep. Discovered at build time (and by the CLI's glob plugin): adding a step (layout,
// …) never touches a shared file. Order: see the table in ../pipeline.ts.
const modules = import.meta.glob<{ default: WireframeStep }>('./*/index.ts', { eager: true });

const steps: WireframeStep[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.order - b.order);

export const getSteps = (): readonly WireframeStep[] => steps;
