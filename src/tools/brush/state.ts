import { create } from 'zustand';
import type { Vec } from '@/model';

export const useBrush = create<{ points: Vec[]; size: number; thinning: number }>()(() => ({ points: [], size: 12, thinning: 0.5 }));
