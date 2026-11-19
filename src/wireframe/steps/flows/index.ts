// Flows (docs/wireframe-mode.md → Flows): a flow lives as long as its source element and its target
// logical screen. Runs after `screens` (which removes logical screens without frames), so deleting an
// element or every frame of a screen removes the flows inside the same undo step.
import { pruneFlows } from '../../flows';
import type { WireframeStep } from '../../types';

const step: WireframeStep = {
  id: 'flows',
  order: 950,
  phases: ['settle', 'load'],
  run(d) {
    if (d.wireframe?.flows) pruneFlows(d);
  },
};

export default step;
