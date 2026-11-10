// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inkBox, report } from '@/icon';
import { resvgRasterize } from '@/icon/resvgRenderer';
import { createDocument, createRect, scale, solid, type DesignDocument, type IconPreset } from '@/model';
import { parseSvg } from '@/io/svgImport';
import { glyphFragment } from '../glyph';
import { fittedNodes, isOnKeyline } from '../fit';
import { glyphStrokeWidths } from '../analysis';

const fixture = (name: string) => readFileSync(join(__dirname, '../../icon/__tests__/fixtures', name), 'utf8');

function iconDoc(glyph: string, preset: IconPreset = 'app-icon', size = 128, k = 1, offset = 0): DesignDocument {
  const { nodes } = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${glyph}</svg>`, {
    currentColor: '#123456',
    matrix: { ...scale(k), e: offset, f: offset },
  });
  return createDocument({ artboard: { width: size, height: size, background: { kind: 'none' } }, children: nodes, icon: { preset, shape: 'auto' } });
}

const measure = async (doc: DesignDocument) => {
  const box = await inkBox(await glyphFragment(doc), resvgRasterize);
  expect(box).not.toBeNull();
  return box!;
};

describe('icon documents', () => {
  it('full colour exports the real paints instead of currentColor', async () => {
    const doc = iconDoc(fixture('glyph-sync.svg'));
    const full = { ...doc, icon: { ...doc.icon!, colour: 'full-colour' as const } };
    expect(await glyphFragment(full)).not.toContain('currentColor');
    expect(await glyphFragment(full)).toContain('#123456');
    expect(await glyphFragment(doc)).toContain('currentColor'); // one colour stays the default
    expect(await glyphFragment(doc, 'full-colour')).toContain('#123456'); // explicit override
    expect(await glyphFragment(full, 'one-colour')).toContain('currentColor');
  });

  it('exports the glyph as a currentColor fragment that measures like the original', async () => {
    const doc = iconDoc(fixture('glyph-sync.svg'));
    const glyph = await glyphFragment(doc);
    expect(glyph).not.toMatch(/<svg|#123456/);
    expect(glyph).toContain('currentColor');
    expect(glyph).toContain('opacity="0.45"');
    const r = report(await measure(doc));
    expect(r.lines[0]).toMatch(/^shape tall: glyph 48% x 68% of the tile, ink (10\.9|11\.0|11\.1)%$/);
    expect(r.halfDiag.toFixed(1)).toBe('29.9');
  });

  it('maps the Android tile (72 of 108) to the 128 space', async () => {
    // The glyph drawn into the visible 72 tile at 18 inset.
    const doc = iconDoc(fixture('glyph-olmapkit.svg'), 'android-adaptive', 108, 72 / 128, 18);
    expect(await glyphFragment(doc)).toMatch(/^<g transform="matrix\(1\.777778 0 0 1\.777778 -32 -32\)">/);
    const r = report(await measure(doc));
    expect(r.lines[0]).toMatch(/^shape tall: glyph 52% x 68% of the tile, ink (8\.4|8\.5|8\.6)%$/);
    expect(r.halfDiag.toFixed(1)).toBe('30.8');
  });

  it('fits the glyph on its keyline the way the script will, strokes included', async () => {
    const doc = iconDoc(fixture('glyph-olmapkit.svg'));
    const before = await measure(doc);
    expect(isOnKeyline(doc, before)).toBe(false);
    const strokes = glyphStrokeWidths(doc);
    const fitted: DesignDocument = { ...doc, children: fittedNodes(doc, before) };
    const after = await measure(fitted);
    expect(isOnKeyline(fitted, after)).toBe(true);
    expect(Math.max(after.w, after.h) / 128).toBeCloseTo(0.68, 2);
    // Same proportions and ink after the fit: the script would print the same numbers.
    expect(report(after).lines).toEqual(report(before).lines);
    const s = Math.max(after.w, after.h) / Math.max(before.w, before.h);
    expect(glyphStrokeWidths(fitted)[0]).toBeCloseTo(strokes[0] * s, 1);
  });

  it('skips reference and hidden objects in the glyph', async () => {
    const doc = createDocument({
      artboard: { width: 128, height: 128, background: { kind: 'none' } },
      icon: { preset: 'app-icon', shape: 'auto' },
      children: [
        createRect({ width: 40, height: 40, transform: { x: 64, y: 64 }, fill: solid('#ff0000') }),
        { ...createRect({ width: 120, height: 120, transform: { x: 64, y: 64 } }), reference: true },
        { ...createRect({ width: 100, height: 100, transform: { x: 64, y: 64 } }), visible: false },
      ],
    });
    const glyph = await glyphFragment(doc);
    expect(glyph.match(/<rect/g)).toHaveLength(1);
    expect(glyph).toContain('fill="currentColor"');
  });
});
