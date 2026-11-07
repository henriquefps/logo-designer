import type { FontFamilyInfo } from './types';

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};

export const weightLabel = (w: number) => (WEIGHT_NAMES[w] ? `${WEIGHT_NAMES[w]} ${w}` : String(w));

/** Weights a family offers: every 100 inside variable ranges plus each static face's weight. */
export function familyWeights(family: FontFamilyInfo): number[] {
  const set = new Set<number>();
  for (const f of family.faces) {
    const [min, max] = f.weight;
    set.add(min);
    set.add(max);
    for (let w = Math.ceil(min / 100) * 100; w <= max; w += 100) set.add(w);
  }
  return [...set].sort((a, b) => a - b);
}

/** [min, max] over all faces; a range wider than one value means a variable weight axis exists. */
export function weightRange(family: FontFamilyInfo): [number, number] {
  return [Math.min(...family.faces.map((f) => f.weight[0])), Math.max(...family.faces.map((f) => f.weight[1]))];
}

export const isVariableWeight = (family: FontFamilyInfo) => family.faces.some((f) => f.weight[1] > f.weight[0]);

export const hasItalic = (family: FontFamilyInfo) => family.faces.some((f) => f.style === 'italic');

/** Nearest offered weight (used when switching family). */
export function nearestWeight(family: FontFamilyInfo, w: number): number {
  if (isVariableWeight(family)) {
    const [min, max] = weightRange(family);
    if (family.faces.some((f) => w >= f.weight[0] && w <= f.weight[1])) return w;
    return Math.min(max, Math.max(min, w));
  }
  return familyWeights(family).reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best));
}
