import { create } from 'zustand';

export type Choice = 'zip' | 'glyph';
export const useChoice = create<{ choice: Choice; set: (c: Choice) => void }>()((set) => ({ choice: 'zip', set: (choice) => set({ choice }) }));
export const appIconChoice = () => useChoice.getState().choice;
