import { create } from 'zustand';

export interface PolygonOptionsState {
  sides: number;
  star: boolean;
  /** Inner radius as a fraction of the outer radius (stars). */
  innerRatio: number;
}

export const usePolygonOptions = create<PolygonOptionsState>()(() => ({ sides: 5, star: false, innerRatio: 0.5 }));
