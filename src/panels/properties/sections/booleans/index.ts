import { isBooleanOperand } from '@/vector/convert';
import type { PropertySection } from '../../types';
import { BooleanSection } from './BooleanSection';

export default {
  id: 'booleans',
  order: 60,
  when: (ctx) => ctx.nodes.filter((n) => !n.locked && isBooleanOperand(n)).length >= 2,
  Component: BooleanSection,
} satisfies PropertySection;
