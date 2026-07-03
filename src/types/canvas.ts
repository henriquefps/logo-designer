export type BackgroundType = 'solid' | 'gradient' | 'transparent';
export type BackgroundShape = 'square' | 'rounded' | 'squircle' | 'circle';

export interface CanvasSettings {
  bgType: BackgroundType;
  bgColor: string;
  bgGradientStart: string;
  bgGradientEnd: string;
  bgGradientAngle: number;
  bgShape: BackgroundShape;
}

export const CANVAS_SIZE = 512;

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  bgType: 'gradient',
  bgColor: '#ffffff',
  bgGradientStart: '#3f3a2f',
  bgGradientEnd: '#7a7259',
  bgGradientAngle: 135,
  bgShape: 'rounded',
};
