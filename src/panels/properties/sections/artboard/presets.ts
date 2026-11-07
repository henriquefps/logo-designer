/** Artboard size presets (New document dialog and Properties → Artboard). */
export const ARTBOARD_PRESETS = [
  { id: 'logo', label: 'Logo', width: 1024, height: 1024 },
  { id: 'icon', label: 'Icon', width: 512, height: 512 },
  { id: 'social', label: 'Social post', width: 1080, height: 1080 },
  { id: 'og', label: 'OG image', width: 1200, height: 630 },
  { id: 'banner', label: 'Banner', width: 1584, height: 396 },
  { id: 'hd', label: 'HD', width: 1920, height: 1080 },
  { id: 'a4', label: 'A4', width: 595, height: 842 },
  { id: 'letter', label: 'Letter', width: 612, height: 792 },
] as const;

export type ArtboardPreset = (typeof ARTBOARD_PRESETS)[number];
export const presetLabel = (p: ArtboardPreset) => `${p.label} ${p.width} × ${p.height}`;
