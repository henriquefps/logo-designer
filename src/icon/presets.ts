// Icon document presets and keyline geometry. The tile T and every keyline follow
// build-icons.mjs (MIRRORS ~/.agents/skills/hfps-kit/repo-assets/assets/build-icons.mjs).
import type { Artboard, IconPreset } from '@/model/types';
import { ANDROID, FAVICON_RX, KEYLINE, REFERENCE_CIRCLE, SMALL_FILL, TILE_RX } from './rules';

export interface IconPresetDef {
  id: IconPreset;
  label: string;
  /** Artboard (canvas) size. */
  size: number;
  hint: string;
}

export const ICON_PRESETS: readonly IconPresetDef[] = [
  { id: 'app-icon', label: 'App icon', size: 128, hint: 'Full icon set' },
  { id: 'android-adaptive', label: 'Android adaptive', size: 108, hint: '72 visible' },
  { id: 'ios', label: 'iOS', size: 1024, hint: 'Opaque square' },
  { id: 'favicon-32', label: 'Favicon 32', size: 32, hint: 'Small glyph' },
  { id: 'favicon-16', label: 'Favicon 16', size: 16, hint: 'Small glyph' },
];

export const iconPresetDef = (id: IconPreset) => ICON_PRESETS.find((p) => p.id === id) ?? ICON_PRESETS[0];
export const isFaviconPreset = (id: IconPreset) => id === 'favicon-32' || id === 'favicon-16';

/** The visible tile in document coordinates. */
export interface IconTile {
  x: number;
  y: number;
  /** T: the visible tile side. */
  size: number;
}

/**
 * The visible tile of an icon document: the whole (square) artboard, except Android adaptive where
 * only the middle 72/108 shows. Non-square artboards use the centred square.
 */
export function iconTile(preset: IconPreset, artboard: Pick<Artboard, 'width' | 'height'>): IconTile {
  const side = Math.min(artboard.width, artboard.height);
  const ox = (artboard.width - side) / 2;
  const oy = (artboard.height - side) / 2;
  if (preset === 'android-adaptive') {
    const k = side / ANDROID.canvas;
    return { x: ox + ANDROID.inset * k, y: oy + ANDROID.inset * k, size: ANDROID.tile * k };
  }
  return { x: ox, y: oy, size: side };
}

/** Uniform map from document coordinates to the glyph's 128 space (tile → 0..128). */
export function docToGlyphSpace(tile: IconTile) {
  const k = 128 / tile.size;
  return { k, e: -tile.x * k, f: -tile.y * k };
}

export type KeylineGuide =
  | { id: string; kind: 'tile'; label: string; x: number; y: number; w: number; h: number; rx: number }
  | { id: string; kind: 'box'; label: string; x: number; y: number; w: number; h: number; dashed?: boolean }
  | { id: string; kind: 'circle'; label: string; cx: number; cy: number; r: number; tone: 'keyline' | 'reference' | 'safe'; dashed?: boolean };

/**
 * Keylines in document coordinates: visible tile (rx 28/128 T, 24 for favicons), keyline boxes
 * 0.60 T (square) and 0.68 T (wide/tall), the 0.46 T short-side floor, keyline circle 0.64 T,
 * the 0.63 T reference circle, and on Android the 108 canvas edge + 66 safe circle.
 */
export function keylineGuides(preset: IconPreset, artboard: Pick<Artboard, 'width' | 'height'>): KeylineGuide[] {
  const t = iconTile(preset, artboard);
  const T = t.size;
  const cx = t.x + T / 2;
  const cy = t.y + T / 2;
  const box = (id: string, label: string, w: number, h: number, dashed?: boolean): KeylineGuide => ({
    id,
    kind: 'box',
    label,
    x: cx - (w * T) / 2,
    y: cy - (h * T) / 2,
    w: w * T,
    h: h * T,
    dashed,
  });
  const fav = isFaviconPreset(preset);
  const out: KeylineGuide[] = [
    { id: 'tile', kind: 'tile', label: `Visible tile T = ${round(T)} (rx ${fav ? FAVICON_RX : TILE_RX}/128)`, x: t.x, y: t.y, w: T, h: T, rx: ((fav ? FAVICON_RX : TILE_RX) / 128) * T },
  ];
  if (fav) {
    out.push(box('small', `Favicon glyph ${SMALL_FILL} T`, SMALL_FILL, SMALL_FILL));
  } else {
    out.push(
      box('square', `Square keyline ${KEYLINE.square.long.toFixed(2)} T`, KEYLINE.square.long, KEYLINE.square.long),
      box('wide', `Wide: ${KEYLINE.wide.long} T long, ≥ ${KEYLINE.wide.short} T short`, KEYLINE.wide.long, KEYLINE.wide.short, true),
      box('tall', `Tall: ${KEYLINE.tall.long} T long, ≥ ${KEYLINE.tall.short} T short`, KEYLINE.tall.short, KEYLINE.tall.long, true),
      { id: 'circle', kind: 'circle', label: `Circle keyline ${KEYLINE.circle.long} T`, cx, cy, r: (KEYLINE.circle.long * T) / 2, tone: 'keyline' },
    );
  }
  out.push({ id: 'reference', kind: 'circle', label: `Reference ${REFERENCE_CIRCLE} T (Signal / WhatsApp)`, cx, cy, r: (REFERENCE_CIRCLE * T) / 2, tone: 'reference', dashed: true });
  if (preset === 'android-adaptive') {
    const k = T / ANDROID.tile;
    out.push({ id: 'safe', kind: 'circle', label: `Safe circle ${ANDROID.safeRadius * 2}dp`, cx, cy, r: ANDROID.safeRadius * k, tone: 'safe', dashed: true });
  }
  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;
