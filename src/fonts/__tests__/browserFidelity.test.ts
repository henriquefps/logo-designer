import { Resvg } from '@resvg/resvg-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportSvg } from '@/io/svgExport';
import { glyphPositions } from '../outline';
import { ensureTextFont } from '../store';
import { installFontFetch } from './helpers';
import { SAMPLES, SAMPLE_W, inkMetrics, sampleDoc } from './renderSamples';
import reference from './fixtures/browser-render.json';

/**
 * Visual regression for the A4 bug ("to-png font bug", docs/wireframe-mode.md → Phase 3): CLI renders
 * (text outlined, rasterized by resvg) must match what the app shows (Chromium text layout).
 * `reference` is Chromium's output for the same samples (scripts/fonts/gen-render-fixture.ts).
 */
type Ref = { id: string; xs: number[]; ink: number; left: number; right: number };
const refs = new Map((reference.samples as Ref[]).map((r) => [r.id, r]));

beforeAll(() => {
  installFontFetch();
});

describe('CLI text renders vs the app (Chromium)', () => {
  it('has a reference for every sample', () => {
    expect(refs.size).toBe(SAMPLES.length);
    expect(SAMPLES.some((s) => s.text === 'Domingo' && s.weight === 600)).toBe(true);
    expect(new Set(SAMPLES.map((s) => s.weight))).toEqual(new Set([400, 500, 600, 700]));
    expect(new Set(SAMPLES.map((s) => s.spacingEm))).toEqual(new Set([0, 0.05, 0.14]));
  });

  it('places every glyph where the browser does (kerning, letter spacing, advances)', async () => {
    let worst = 0;
    for (const s of SAMPLES) {
      const ref = refs.get(s.id)!;
      const node = sampleDoc(s).children[0];
      if (node.type !== 'text') throw new Error('sample is not text');
      const { resolved, font } = await ensureTextFont(node);
      const xs = glyphPositions(node, font!, resolved)[0].glyphs.map((g) => g.x);
      expect(xs).toHaveLength(ref.xs.length);
      xs.forEach((x, i) => {
        const err = Math.abs(x - ref.xs[i]); // both node-local (the browser's are the tspan's, inside the text's transform)
        worst = Math.max(worst, err);
        expect(err, `${s.id} glyph ${i}`).toBeLessThanOrEqual(0.15);
      });
    }
    expect(worst).toBeLessThan(0.15);
  });

  it('renders the same amount of ink over the same width as the browser', async () => {
    for (const s of SAMPLES) {
      const ref = refs.get(s.id)!;
      const { svg } = await exportSvg(sampleDoc(s));
      const img = new Resvg(svg, { fitTo: { mode: 'width', value: SAMPLE_W * 2 }, font: { loadSystemFonts: false } }).render();
      const m = inkMetrics(img.pixels, img.width, img.height, img.width / SAMPLE_W);
      // Weight (ink): the old bug made Inter 500–700 up to 7% lighter, and a "D" a third too thin.
      expect(Math.abs(m.ink / ref.ink - 1), `${s.id} ink ${m.ink} vs ${ref.ink}`).toBeLessThanOrEqual(0.03);
      // Spacing: first/last inked column.
      expect(Math.abs(m.left - ref.left), `${s.id} left`).toBeLessThanOrEqual(0.75);
      expect(Math.abs(m.right - ref.right), `${s.id} right`).toBeLessThanOrEqual(0.75);
    }
  });

  it('keeps a heavier weight heavier (400 < 500 < 600 < 700) for one string', async () => {
    const inks: number[] = [];
    for (const weight of [400, 500, 600, 700]) {
      const s = SAMPLES.find((x) => x.text === 'SERVIDOR' && x.weight === weight && x.spacingEm === 0.14)!;
      const { svg } = await exportSvg(sampleDoc(s));
      const img = new Resvg(svg, { fitTo: { mode: 'width', value: SAMPLE_W } }).render();
      inks.push(inkMetrics(img.pixels, img.width, img.height, 1).ink);
    }
    expect([...inks].sort((a, b) => a - b)).toEqual(inks);
  });
});
