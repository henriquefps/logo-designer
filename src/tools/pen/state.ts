import { create } from 'zustand';
import type { Id, Vec } from '@/model';

/** Pen tool state shared with its overlay. */
export const usePen = create<{ nodeId: Id | null; hover: Vec | null; closeHover: boolean }>()(() => ({
  nodeId: null,
  hover: null,
  closeHover: false,
}));
