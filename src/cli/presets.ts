// Artboard presets for `designer new --preset` / `from-svg --icon`. The icon presets match the
// project's optional `icon` field (docs/project-format.md).
export const ICON_PRESETS = ['app-icon', 'android-adaptive', 'ios', 'favicon-32', 'favicon-16'] as const;
export type IconPreset = (typeof ICON_PRESETS)[number];
export const ICON_SHAPES = ['auto', 'circle', 'square', 'wide', 'tall'] as const;
export type IconShape = (typeof ICON_SHAPES)[number];

/** `icon` field of a project (added by the icon mode; extra fields are kept by the CLI). */
export interface IconSettings {
  preset: IconPreset;
  shape: IconShape;
  smallGlyphProjectId?: string;
}

export const PRESET_SIZES: Record<IconPreset, { width: number; height: number }> = {
  'app-icon': { width: 128, height: 128 },
  'android-adaptive': { width: 108, height: 108 },
  ios: { width: 128, height: 128 },
  'favicon-32': { width: 32, height: 32 },
  'favicon-16': { width: 16, height: 16 },
};

export const isIconPreset = (s: string): s is IconPreset => (ICON_PRESETS as readonly string[]).includes(s);

/** `app-icon` | `1920x1080` → size (+ icon preset). Throws a readable error. */
export function parsePreset(s: string): { width: number; height: number; icon?: IconPreset } {
  if (isIconPreset(s)) return { ...PRESET_SIZES[s], icon: s };
  const m = s.match(/^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)$/i);
  if (m && +m[1] > 0 && +m[2] > 0) return { width: +m[1], height: +m[2] };
  throw new Error(`Unknown preset “${s}”: use ${ICON_PRESETS.join(', ')} or WIDTHxHEIGHT (e.g. 1920x1080).`);
}
