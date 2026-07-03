export interface FontOption {
  label: string;
  family: string;
  weights: { label: string; value: string }[];
  defaultWeight: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    label: 'Inter',
    family: 'Inter Variable',
    defaultWeight: '700',
    weights: [
      { label: 'Regular', value: '400' },
      { label: 'Medium', value: '500' },
      { label: 'Semibold', value: '600' },
      { label: 'Bold', value: '700' },
      { label: 'Extrabold', value: '800' },
      { label: 'Black', value: '900' },
    ],
  },
  {
    label: 'Space Grotesk',
    family: 'Space Grotesk Variable',
    defaultWeight: '600',
    weights: [
      { label: 'Regular', value: '400' },
      { label: 'Medium', value: '500' },
      { label: 'Semibold', value: '600' },
      { label: 'Bold', value: '700' },
    ],
  },
  {
    label: 'Playfair Display',
    family: 'Playfair Display Variable',
    defaultWeight: '700',
    weights: [
      { label: 'Regular', value: '400' },
      { label: 'Medium', value: '500' },
      { label: 'Semibold', value: '600' },
      { label: 'Bold', value: '700' },
      { label: 'Black', value: '900' },
    ],
  },
  {
    label: 'JetBrains Mono',
    family: 'JetBrains Mono Variable',
    defaultWeight: '700',
    weights: [
      { label: 'Regular', value: '400' },
      { label: 'Medium', value: '500' },
      { label: 'Semibold', value: '600' },
      { label: 'Bold', value: '700' },
    ],
  },
  {
    label: 'Bebas Neue',
    family: 'Bebas Neue',
    defaultWeight: '400',
    weights: [{ label: 'Regular', value: '400' }],
  },
];

export function findFont(family: string): FontOption {
  return FONT_OPTIONS.find((f) => f.family === family) ?? FONT_OPTIONS[0];
}
