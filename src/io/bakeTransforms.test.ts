// @vitest-environment happy-dom
import { Resvg } from '@resvg/resvg-js';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { buildIconSet } from '@/icon/iconSet';
import { resvgRenderer } from '@/icon/resvgRenderer';
import { createDocument } from '@/model';
import { exportGlyph } from './glyphExport';
import { exportSvg } from './svgExport';
import { svgToDocument } from './svgDocument';
import { ensureSvgGeometry } from './svgImport';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" stroke="#fff" stroke-width="3">
  <g><circle cx="40" cy="40" r="20"/><rect x="60" y="60" width="40" height="40"/></g>
  <g transform="translate(10 5) rotate(20) scale(0.8 0.8)"><rect x="20" y="70" width="30" height="20" rx="4" fill="none"/><ellipse cx="90" cy="30" rx="14" ry="8"/><path d="M20 20 L50 20 L35 45 Z" fill="none"/></g>
  <g transform="scale(1.2 0.7)"><circle cx="30" cy="100" r="10" stroke="none"/></g>
</svg>`;

async function load() {
  await ensureSvgGeometry(SVG);
  const { doc } = svgToDocument(SVG, 'g');
  return { ...doc, icon: { preset: 'app-icon' as const, shape: 'auto' as const } };
}
const px = (svg: string) => new Resvg(svg, { fitTo: { mode: 'width', value: 128 } }).render().pixels;

describe('glyph export bakes transforms', () => {
  it('has no transform attribute and draws exactly what the transformed document draws', async () => {
    const doc = await load();
    const glyph = await exportGlyph(doc);
    expect(glyph).not.toContain('transform');
    const wrap = (b: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" color="#000">${b}</svg>`;
    const ref = (await exportSvg(doc, { currentColor: true, background: false })).svg;
    const a = px(wrap(glyph));
    const b = px(ref);
    let diff = 0;
    for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 8) diff++;
    expect(diff).toBeLessThan(40); // anti-aliasing noise only
  });

  it('untransformed documents keep their glyph', async () => {
    const doc = createDocument({ name: 'x', artboard: { width: 128, height: 128, background: { kind: 'none' } } });
    expect(await exportGlyph(doc)).toBe('');
  });

  it('icons: a grouped project writes a well-formed drawable/ic_splash.xml', async () => {
    const glyph = await exportGlyph(await load());
    const r = await buildIconSet({ glyph }, resvgRenderer);
    expect(r.notes.join('\n')).not.toContain('splash');
    const f = r.files.find((x) => x.path === 'android/res/drawable/ic_splash.xml')!;
    expect(f).toBeTruthy();
    const problems: string[] = [];
    new DOMParser({ onError: (_l: string, m: string) => problems.push(m) } as never).parseFromString(String(f.data), 'text/xml');
    expect(problems).toEqual([]);
  }, 60_000);
});
