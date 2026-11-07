import { create } from 'zustand';
import type { FreehandPoint } from '@/vector/freehand';

export const useBrush = create<{ points: FreehandPoint[]; size: number; thinning: number }>()(() => ({ points: [], size: 12, thinning: 0.5 }));
