import type { Palette } from './hfps.ts';
import type { Demo } from './demo.ts';

export interface Scenario {
  /** File name without extension, e.g. `01-tela-e-componentes`. */
  name: string;
  /** Number of captioned steps (shown as "3/7" next to the caption). */
  steps: number;
  /** Optional preparation through the UI, run fast and cut from the video. */
  setup?(demo: Demo): Promise<void>;
  run(demo: Demo): Promise<void>;
  /** The recording's size (default: the app at 1280 × 800 under a 40 px caption bar) and the overlay's palette. */
  video?: { width?: number; appHeight?: number; captionHeight?: number; palette?: Palette };
  /** Optional cleanup after the recording (processes the scenario started, e.g. a sync server). */
  teardown?(): Promise<void>;
}
