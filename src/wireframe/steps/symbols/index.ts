// Shared components (docs/wireframe-mode.md → Phase 2 → Shared components, ../../symbols.ts): an edit
// inside any instance becomes its master's content, and every other instance follows, in the same undo
// step. Runs after `resize` (400: a resized child inside an instance is part of the edit) and before
// `repeat` (450: a repeat template that is an instance is up to date before it is copied) and `layout`
// (500: rewritten instances are laid out at their own size).
import { syncSymbols } from '../../symbols';
import type { WireframeStep } from '../../types';

const step: WireframeStep = {
  id: 'symbols',
  order: 420,
  run: syncSymbols,
};

export default step;
