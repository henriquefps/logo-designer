/** Artboard size presets (Properties → Artboard). */
export const ARTBOARD_PRESETS = [
  { id: 'square-1024', label: 'Square 1024 × 1024', width: 1024, height: 1024 },
  { id: 'square-512', label: 'Square 512 × 512', width: 512, height: 512 },
  { id: 'og', label: 'Social 1200 × 630', width: 1200, height: 630 },
  { id: 'hd', label: 'Full HD 1920 × 1080', width: 1920, height: 1080 },
  { id: 'a4', label: 'A4 595 × 842', width: 595, height: 842 },
] as const;
