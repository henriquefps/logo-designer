import type { Demo } from './demo.ts';

export interface Scenario {
  /** File name without extension, e.g. `01-tela-e-componentes`. */
  name: string;
  /** Number of captioned steps (shown as "3/7" next to the caption). */
  steps: number;
  /** Optional preparation through the UI, run fast and cut from the video. */
  setup?(demo: Demo): Promise<void>;
  run(demo: Demo): Promise<void>;
}
