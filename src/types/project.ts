import type { LogoElement } from './element';
import type { CanvasSettings } from './canvas';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  canvasSettings: CanvasSettings;
  elements: LogoElement[];
}
