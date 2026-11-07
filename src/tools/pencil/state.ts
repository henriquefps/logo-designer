import { create } from 'zustand';
import type { Vec } from '@/model';

export const usePencil = create<{ points: Vec[]; smoothness: number }>()(() => ({ points: [], smoothness: 50 }));
