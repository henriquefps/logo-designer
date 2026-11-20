import { createDocument, createText, solid, type DesignDocument } from '@/model';

/**
 * The fixed text set of the CLI-render fidelity test (docs/wireframe-mode.md → Phase 3 → A4).
 * `scripts/fonts/gen-render-fixture.ts` renders it in Chromium (what the app shows) and stores the
 * numbers in fixtures/browser-render.json; the test renders the same set through the CLI path.
 */
export const SAMPLE_SIZE = 28;
export const SAMPLE_W = 480;
export const SAMPLE_H = 48;
export const SAMPLE_X = 10;
export const SAMPLE_Y = 6;
export const WEIGHTS = [400, 500, 600, 700] as const;
export const SPACINGS_EM = [0, 0.05, 0.14] as const;
export const WORDS = ['Domingo', 'SERVIDOR', 'Configurações — Ação', 'AVATAR Ty To Wa', 'Hamburgefonstiv 0123', 'Terça · Quinta · Sábado'] as const;
export const FAMILIES = ['Inter'] as const;

export interface Sample {
  id: string;
  family: string;
  text: string;
  weight: number;
  spacingEm: number;
}

export const SAMPLES: Sample[] = FAMILIES.flatMap((family) =>
  WEIGHTS.flatMap((weight) => SPACINGS_EM.flatMap((spacingEm) => WORDS.map((text) => ({ id: `${family}|${weight}|${spacingEm}|${text}`, family, text, weight, spacingEm })))),
);

/** One sample as a document: the text on a white 480×48 artboard. */
export function sampleDoc(s: Sample): DesignDocument {
  return createDocument({
    artboard: { width: SAMPLE_W, height: SAMPLE_H, background: solid('#ffffff') },
    children: [
      createText({
        text: s.text,
        fontFamily: s.family,
        fontWeight: s.weight,
        fontSize: SAMPLE_SIZE,
        letterSpacing: s.spacingEm * SAMPLE_SIZE,
        fill: solid('#000000'),
        transform: { x: SAMPLE_X, y: SAMPLE_Y, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    ],
  });
}

export interface Ink {
  /** Total darkness in px² (a fully black pixel counts 1/scale²). */
  ink: number;
  /** First / last px column with ink, in artboard px. */
  left: number;
  right: number;
}

/** Ink amount and horizontal extent of black-on-white RGBA pixels rendered at `scale`. */
export function inkMetrics(rgba: ArrayLike<number>, width: number, height: number, scale: number): Ink {
  const cols = new Float64Array(width);
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      const v = 1 - (rgba[i] * a + 255 * (1 - a)) / 255; // darkness after compositing over white
      cols[x] += v;
      total += v;
    }
  }
  const first = cols.findIndex((c) => c > 0.5);
  let last = -1;
  for (let x = width - 1; x >= 0; x--) if (cols[x] > 0.5) { last = x; break; }
  return { ink: total / (scale * scale), left: first / scale, right: (last + 1) / scale };
}
