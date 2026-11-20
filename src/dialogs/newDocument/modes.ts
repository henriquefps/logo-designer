// New document dialog, step logic (no React): the three design modes, the options of each with their
// defaults, and keyboard movement between the mode cards. The dialog (NewDocumentDialog.tsx) renders
// it; create.ts turns a choice into a document.
import { ICON_PRESETS } from '@/icon/presets';
import type { IconColourMode, IconPreset, IconShapeSetting, ScreenPlatform } from '@/model';
import { ARTBOARD_PRESETS } from '@/panels/properties/sections/artboard/presets';

export type DesignMode = 'icon' | 'wireframe' | 'free';

export interface ModeDef {
  id: DesignMode;
  label: string;
  /** One line: what the mode is for. */
  description: string;
  /** Title of step 2. */
  title: string;
}

/** Step 1, in this order: equal cards, the free project is not first and not larger. */
export const DESIGN_MODES: readonly ModeDef[] = [
  { id: 'icon', label: 'App icon', title: 'New app icon', description: 'An icon for Android, iOS and the web, with keylines and every export size.' },
  { id: 'wireframe', label: 'Wireframe', title: 'New wireframe', description: "Plan an app's screens and flow, then hand it to an AI." },
  { id: 'free', label: 'Free project', title: 'New free project', description: 'Any vector artwork, on an artboard of the size you choose.' },
];

export const modeDef = (id: DesignMode): ModeDef => DESIGN_MODES.find((m) => m.id === id) ?? DESIGN_MODES[0];

/** Largest artboard side accepted by the custom size. */
export const MAX_SIDE = 16384;

export interface IconOptions {
  mode: 'icon';
  name: string;
  preset: IconPreset;
  shape: IconShapeSetting;
  /** Tile colour `#rrggbb`; undefined = the default (hfps blue). */
  tile?: string;
  colour: IconColourMode;
  /** One-colour glyph `#rrggbb`; undefined = white. */
  glyph?: string;
}

export interface WireframeOptions {
  mode: 'wireframe';
  name: string;
  /** Platform of the first screen. */
  platform: ScreenPlatform;
}

export interface FreeOptions {
  mode: 'free';
  name: string;
  /** An ARTBOARD_PRESETS id, or 'custom' (then width × height). */
  size: string;
  width: number;
  height: number;
}

export type ModeOptions = IconOptions | WireframeOptions | FreeOptions;

/** Defaults: creating is one click (Create) after picking the mode. Empty name = the mode's default name. */
export function defaultOptions(mode: 'icon'): IconOptions;
export function defaultOptions(mode: 'wireframe'): WireframeOptions;
export function defaultOptions(mode: 'free'): FreeOptions;
export function defaultOptions(mode: DesignMode): ModeOptions;
export function defaultOptions(mode: DesignMode): ModeOptions {
  switch (mode) {
    case 'icon':
      return { mode, name: '', preset: ICON_PRESETS[0].id, shape: 'auto', colour: 'one-colour' };
    case 'wireframe':
      return { mode, name: '', platform: 'phone' };
    case 'free': {
      const p = ARTBOARD_PRESETS[0];
      return { mode, name: '', size: p.id, width: p.width, height: p.height };
    }
  }
}

/** The artboard size a free-project choice creates (custom sizes rounded and clamped to 1..MAX_SIDE). */
export function freeSize(o: FreeOptions): { width: number; height: number } {
  const preset = ARTBOARD_PRESETS.find((p) => p.id === o.size);
  if (preset) return { width: preset.width, height: preset.height };
  const side = (v: number) => Math.min(MAX_SIDE, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));
  return { width: side(o.width), height: side(o.height) };
}

/** Name the new project gets when the name field is left empty. */
export function defaultName(o: ModeOptions): string {
  if (o.mode === 'wireframe') return 'Wireframe';
  if (o.mode === 'free') return 'Untitled';
  return o.preset === 'app-icon' ? 'App icon' : (ICON_PRESETS.find((p) => p.id === o.preset)?.label ?? 'App icon');
}

/** The dialog's step: the mode cards, or one mode's options. */
export type Step = { step: 'mode' } | { step: 'options'; options: ModeOptions };

export const firstStep = (): Step => ({ step: 'mode' });
export const pickMode = (mode: DesignMode): Step => ({ step: 'options', options: defaultOptions(mode) });

/**
 * Arrow keys on the mode cards: Left/Up go back, Right/Down go forward (cards sit in one row on
 * desktop and stack on a phone, so both axes move the same way), Home/End jump; no wrap.
 * Returns the new index, or null for keys it does not handle.
 */
export function moveFocus(index: number, key: string, count = DESIGN_MODES.length): number | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return Math.max(0, index - 1);
    case 'ArrowRight':
    case 'ArrowDown':
      return Math.min(count - 1, index + 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
