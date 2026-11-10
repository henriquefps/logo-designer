// Artboard presets for `designer new --preset` / `from-svg --icon`. The icon presets and sizes come
// from the app's icon mode (src/icon/presets.ts), so the CLI and the New document dialog agree.
import { ICON_PRESETS as ICON_PRESET_DEFS } from '@/icon/presets';
import type { IconDocInfo, IconPreset as ModelIconPreset } from '@/model';

export const ICON_PRESETS = ICON_PRESET_DEFS.map((p) => p.id);
export type IconPreset = ModelIconPreset;
export const ICON_SHAPES = ['auto', 'circle', 'square', 'wide', 'tall'] as const;
export type IconShape = (typeof ICON_SHAPES)[number];

/** `icon` field of a project. */
export type IconSettings = IconDocInfo;

export const PRESET_SIZES = Object.fromEntries(ICON_PRESET_DEFS.map((p) => [p.id, { width: p.size, height: p.size }])) as Record<
  IconPreset,
  { width: number; height: number }
>;

export const isIconPreset = (s: string): s is IconPreset => (ICON_PRESETS as readonly string[]).includes(s);

/** `app-icon` | `1920x1080` → size (+ icon preset). Throws a readable error. */
export function parsePreset(s: string): { width: number; height: number; icon?: IconPreset } {
  if (isIconPreset(s)) return { ...PRESET_SIZES[s], icon: s };
  const m = s.match(/^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)$/i);
  if (m && +m[1] > 0 && +m[2] > 0) return { width: +m[1], height: +m[2] };
  throw new Error(`Unknown preset “${s}”: use ${ICON_PRESETS.join(', ')} or WIDTHxHEIGHT (e.g. 1920x1080).`);
}
