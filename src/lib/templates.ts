import { createId } from '@/lib/id';
import { DEFAULT_CANVAS_SETTINGS, type CanvasSettings } from '@/types/canvas';
import type { IconElement, LogoElement, TextElement } from '@/types/element';

function icon(partial: Omit<IconElement, 'id' | 'type' | 'flipH' | 'flipV' | 'locked' | 'opacity' | 'rotation'> & Partial<Pick<IconElement, 'opacity' | 'rotation'>>): IconElement {
  return { id: createId(), type: 'icon', flipH: false, flipV: false, locked: false, opacity: 100, rotation: 0, ...partial };
}

function text(partial: Omit<TextElement, 'id' | 'type' | 'flipH' | 'flipV' | 'locked' | 'opacity' | 'rotation'> & Partial<Pick<TextElement, 'opacity' | 'rotation'>>): TextElement {
  return { id: createId(), type: 'text', flipH: false, flipV: false, locked: false, opacity: 100, rotation: 0, ...partial };
}

export interface Template {
  id: string;
  name: string;
  build: () => { canvasSettings: CanvasSettings; elements: LogoElement[] };
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank canvas',
    build: () => ({ canvasSettings: DEFAULT_CANVAS_SETTINGS, elements: [] }),
  },
  {
    id: 'icon-mark',
    name: 'Icon mark',
    build: () => ({
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS, bgType: 'transparent', bgShape: 'square' },
      elements: [icon({ iconType: 'lucide', name: 'Sparkle', x: 256, y: 256, size: 240, color: '#211f1a', strokeWidth: 1.6 })],
    }),
  },
  {
    id: 'circle-emblem',
    name: 'Circle emblem',
    build: () => ({
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS, bgType: 'solid', bgColor: '#211f1a', bgShape: 'circle' },
      elements: [
        icon({ iconType: 'lucide', name: 'Compass', x: 256, y: 216, size: 140, color: '#f4f1ea', strokeWidth: 1.6 }),
        text({ text: 'BRAND', x: 256, y: 356, size: 32, color: '#f4f1ea', fontFamily: 'Inter Variable', fontWeight: '700' }),
      ],
    }),
  },
  {
    id: 'wordmark',
    name: 'Wordmark',
    build: () => ({
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS, bgType: 'transparent', bgShape: 'square' },
      elements: [text({ text: 'Wordmark', x: 256, y: 256, size: 64, color: '#211f1a', fontFamily: 'Inter Variable', fontWeight: '800' })],
    }),
  },
  {
    id: 'badge',
    name: 'Rounded badge',
    build: () => ({
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS, bgType: 'gradient', bgGradientStart: '#3f3a2f', bgGradientEnd: '#7a7259', bgGradientAngle: 135, bgShape: 'rounded' },
      elements: [
        icon({ iconType: 'lucide', name: 'ShieldCheck', x: 256, y: 220, size: 130, color: '#faf8f2', strokeWidth: 1.6 }),
        text({ text: 'BADGE CO.', x: 256, y: 350, size: 28, color: '#faf8f2', fontFamily: 'Inter Variable', fontWeight: '700' }),
      ],
    }),
  },
  {
    id: 'stacked',
    name: 'Icon over text',
    build: () => ({
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS, bgType: 'transparent', bgShape: 'square' },
      elements: [
        icon({ iconType: 'lucide', name: 'Hexagon', x: 256, y: 200, size: 150, color: '#211f1a', strokeWidth: 1.4 }),
        text({ text: 'STUDIO', x: 256, y: 360, size: 36, color: '#211f1a', fontFamily: 'Inter Variable', fontWeight: '800' }),
      ],
    }),
  },
  {
    id: 'squircle-duo',
    name: 'Squircle duotone',
    build: () => ({
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS, bgType: 'solid', bgColor: '#7a5c9e', bgShape: 'squircle' },
      elements: [icon({ iconType: 'phosphor', name: 'Lightning', x: 256, y: 256, size: 220, color: '#faf8f2', weight: 'fill' })],
    }),
  },
];
