// Choices shared by Properties → App icon and New document → App icon.
import type { IconColourMode, IconShapeSetting } from '@/model';

/** Keyline shape setting (auto detects square / wide / tall). */
export const SHAPES: { id: IconShapeSetting; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'circle', label: 'Circle (0.64 T)' },
  { id: 'square', label: 'Square (0.60 T)' },
  { id: 'wide', label: 'Wide (0.68 T)' },
  { id: 'tall', label: 'Tall (0.68 T)' },
];

export const COLOUR_MODES: { id: IconColourMode; label: string }[] = [
  { id: 'one-colour', label: 'One colour' },
  { id: 'full-colour', label: 'Full colour' },
];
