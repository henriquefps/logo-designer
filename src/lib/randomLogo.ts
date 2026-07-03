import { createId } from '@/lib/id';
import { getLucideIconNames } from '@/lib/icons/lucideIconNames';
import { getPhosphorIconNames } from '@/lib/icons/phosphorIconNames';
import { CURATED_PALETTE } from '@/lib/palettes';
import { FONT_OPTIONS } from '@/lib/fonts';
import { DEFAULT_CANVAS_SETTINGS, type BackgroundShape, type BackgroundType, type CanvasSettings } from '@/types/canvas';
import type { IconElement, LogoElement, TextElement } from '@/types/element';

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const BG_TYPES: BackgroundType[] = ['solid', 'gradient', 'transparent'];
const BG_SHAPES: BackgroundShape[] = ['square', 'rounded', 'squircle', 'circle'];
const PHOSPHOR_WEIGHTS = ['regular', 'bold', 'fill', 'duotone'] as const;
const ROTATIONS = [0, 0, 0, -10, 10, -15, 15];
const WORDS = ['STUDIO', 'LABS', 'CO.', 'FORGE', 'WORKS', 'GROUP', 'MARK'];

export async function generateRandomLogo(): Promise<{ name: string; canvasSettings: CanvasSettings; elements: LogoElement[] }> {
  const useLucide = Math.random() < 0.5;
  const names = useLucide ? await getLucideIconNames() : await getPhosphorIconNames();
  const iconName = pick(names);

  const bg = pick(CURATED_PALETTE);
  const otherColors = CURATED_PALETTE.filter((c) => c !== bg);
  const fg = pick(otherColors);

  const canvasSettings: CanvasSettings = {
    ...DEFAULT_CANVAS_SETTINGS,
    bgType: pick(BG_TYPES),
    bgColor: bg,
    bgGradientStart: bg,
    bgGradientEnd: pick(otherColors),
    bgGradientAngle: pick([45, 90, 135, 180]),
    bgShape: pick(BG_SHAPES),
  };

  const withText = Math.random() < 0.7;

  const iconElement: IconElement = {
    id: createId(),
    type: 'icon',
    iconType: useLucide ? 'lucide' : 'phosphor',
    name: iconName,
    x: 256,
    y: withText ? 216 : 256,
    size: 120 + Math.floor(Math.random() * 120),
    color: fg,
    strokeWidth: 1.2 + Math.random() * 1.4,
    weight: useLucide ? undefined : pick(PHOSPHOR_WEIGHTS),
    rotation: pick(ROTATIONS),
    opacity: 100,
    flipH: false,
    flipV: false,
    locked: false,
  };

  const elements: LogoElement[] = [iconElement];

  if (withText) {
    const font = pick(FONT_OPTIONS);
    const textElement: TextElement = {
      id: createId(),
      type: 'text',
      text: pick(WORDS),
      x: 256,
      y: 360,
      size: 26 + Math.floor(Math.random() * 10),
      color: fg,
      fontFamily: font.family,
      fontWeight: font.defaultWeight,
      rotation: 0,
      opacity: 100,
      flipH: false,
      flipV: false,
      locked: false,
    };
    elements.push(textElement);
  }

  return { name: 'Surprise me', canvasSettings, elements };
}
