// Regenerates src/fonts/__tests__/fixtures/browser-render.json: what headless Chromium (the app's
// text engine) does with the fixed sample set of the CLI-render fidelity test.
//   bun scripts/fonts/gen-render-fixture.ts
// Needs Playwright's Chromium (`bunx playwright install chromium`). Re-run only when the sample set
// in src/fonts/__tests__/renderSamples.ts changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { setupHeadless } from '@/cli/env';
import { exportSvg } from '@/io/svgExport';
import { SAMPLES, SAMPLE_H, SAMPLE_W, inkMetrics, sampleDoc } from '@/fonts/__tests__/renderSamples';

await setupHeadless();
const b64 = readFileSync('src/fonts/files/inter-variable.ttf').toString('base64');
const css = `<style>@font-face{font-family:"dz Inter";src:url(data:font/ttf;base64,${b64});font-weight:100 900}
body{margin:0;background:#fff}svg text{font-family:"dz Inter";font-variant-ligatures:none;text-rendering:geometricPrecision}</style>`;
const browser = await chromium.launch();
const out: Record<string, unknown>[] = [];
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: SAMPLE_W, height: SAMPLE_H } });
const page = await ctx.newPage();
await page.setContent(css);
await page.evaluate(() => document.fonts.load('400 28px "dz Inter"', 'Domingo'));
for (const s of SAMPLES) {
  const live = (await exportSvg(sampleDoc(s), { outlineText: false })).svg;
  await page.evaluate((svg) => (document.body.innerHTML = svg), live);
  const xs = await page.evaluate(() => {
    const t = document.querySelector('svg text tspan') as unknown as SVGTextContentElement;
    return Array.from({ length: t.getNumberOfChars() }, (_, i) => t.getStartPositionOfChar(i).x);
  });
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: SAMPLE_W, height: SAMPLE_H } });
  const px = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, data: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
  }, shot.toString('base64'));
  const m = inkMetrics(px.data, px.w, px.h, px.w / SAMPLE_W);
  out.push({ id: s.id, xs: xs.map((x) => Math.round(x * 1000) / 1000), ink: Math.round(m.ink * 1000) / 1000, left: m.left, right: m.right });
}
await browser.close();
writeFileSync('src/fonts/__tests__/fixtures/browser-render.json', JSON.stringify({ chromium: browser.version(), samples: out }, null, 1) + '\n');
console.log('wrote', out.length, 'samples');
