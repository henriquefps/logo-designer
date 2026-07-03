import type { LogoElement } from '@/types/element';

/** Text needs real DOM measurement (getBBox); icon/image are a fixed `size` square; shapes carry their own width/height. */
export function getElementSize(element: LogoElement, textSize?: { width: number; height: number }): { width: number; height: number } {
  if (element.type === 'text') {
    return textSize ?? { width: element.text.length * element.size * 0.6, height: element.size * 1.2 };
  }
  if (element.type === 'shape') {
    return { width: Math.abs(element.width), height: Math.abs(element.height) };
  }
  return { width: element.size, height: element.size };
}
