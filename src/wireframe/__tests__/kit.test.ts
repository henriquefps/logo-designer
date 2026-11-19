import { afterEach, describe, expect, it } from 'vitest';
import { boundsIn, fromTransform, createPath, solid, type GroupNode, type RectNode, type SceneNode } from '@/model';
import { box, checkbox, chevron, icon, imagePlaceholder, lineHeight, radio, text, textBars, textBarsHeight, toggle, truncate, textWidth, TOGGLE } from '../kit';
import { clearIconCache, harvestIcons, iconKeyOf, normalizeIconName, registerIcon, takeMissingIcons } from '../icons';
import { WF, WF_TEXT } from '../style';

const b = (n: SceneNode) => boundsIn(n, fromTransform(n.transform))!;
const glyph = () => createPath({ name: 'g', subpaths: [{ closed: false, points: [{ x: -12, y: -12, type: 'corner' }, { x: 12, y: 12, type: 'corner' }] }], stroke: { paint: solid('#ff0000'), width: 2, cap: 'round', join: 'round', dash: [] } });

afterEach(() => clearIconCache());

describe('wireframe kit', () => {
  it('box takes top-left coordinates and clamps the radius', () => {
    const r = box({ x: 10, y: 20, width: 100, height: 40, radius: 9999, fill: 'ink' }) as RectNode;
    expect(b(r)).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    expect(r.radius).toBe(20);
    expect(r.fill).toEqual(solid(WF.ink));
  });

  it('text uses Inter and the style tokens', () => {
    const t = text('Hello', { x: 4, y: 8, style: 'heading', tone: 'inkMuted' });
    expect(t).toMatchObject({ fontFamily: 'Inter', fontSize: WF_TEXT.heading.size, fontWeight: WF_TEXT.heading.weight, fill: solid(WF.inkMuted) });
    expect(t.transform).toMatchObject({ x: 4, y: 8 });
    expect(lineHeight('heading')).toBeCloseTo(22 * 1.3);
  });

  it('truncate shortens with an ellipsis to fit', () => {
    const long = 'A very long title that will not fit';
    const max = textWidth('A very long', 'body');
    const out = truncate(long, max);
    expect(out.endsWith('…')).toBe(true);
    expect(textWidth(out)).toBeLessThanOrEqual(max);
    expect(truncate('Short', 1000)).toBe('Short');
    expect(truncate('Short', 0)).toBe('');
  });

  it('text bars: one bar per line, the last one shorter', () => {
    const g = textBars({ x: 0, y: 0, width: 200, lines: 3 }) as GroupNode;
    expect(g.children).toHaveLength(3);
    expect((g.children[2] as RectNode).width).toBeCloseTo(120);
    expect(b(g).y + b(g).height).toBeLessThanOrEqual(textBarsHeight(3));
  });

  it('image placeholder is a grey box with an X', () => {
    const g = imagePlaceholder({ x: 0, y: 0, width: 80, height: 60 }) as GroupNode;
    expect(g.children.map((c) => c.name)).toEqual(['Frame', 'Cross']);
    expect(b(g)).toEqual({ x: 0, y: 0, width: 80, height: 60 });
  });

  it('controls fit their boxes', () => {
    expect(b(toggle({ x: 0, y: 0 }))).toEqual({ x: 0, y: 0, width: TOGGLE.width, height: TOGGLE.height });
    expect((checkbox({ x: 0, y: 0, checked: false }) as GroupNode).children).toHaveLength(1);
    expect((checkbox({ x: 0, y: 0 }) as GroupNode).children).toHaveLength(2);
    expect((radio({ x: 0, y: 0, selected: false }) as GroupNode).children).toHaveLength(1);
    const c = b(chevron({ x: 0, y: 0, size: 20 }));
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(20);
  });
});

describe('icons', () => {
  it('normalises names', () => {
    expect(normalizeIconName('')).toBe('');
    expect(normalizeIconName('heart')).toBe('lucide:Heart');
    expect(normalizeIconName('arrow-right')).toBe('lucide:ArrowRight');
    expect(normalizeIconName('ArrowRight')).toBe('lucide:ArrowRight');
    expect(normalizeIconName('lucide:Heart')).toBe('lucide:Heart');
    expect(normalizeIconName('ph:heart-bold')).toBe('iconify:ph:heart-bold');
    expect(normalizeIconName('iconify:mdi:home')).toBe('iconify:mdi:home');
  });

  it('draws a placeholder until the glyph is cached, and reports it missing', () => {
    expect(icon('', { x: 0, y: 0 })).toBeNull();
    const ph = icon('heart', { x: 0, y: 0, size: 20 }) as GroupNode;
    expect(iconKeyOf(ph)).toBe('lucide:Heart');
    expect(ph.children[0].name).toBe('Placeholder');
    expect(takeMissingIcons()).toEqual(['lucide:Heart']);
    expect(takeMissingIcons()).toEqual([]);

    registerIcon('lucide:Heart', glyph());
    const g = icon('heart', { x: 10, y: 10, size: 48, tone: 'inkMuted' }) as GroupNode;
    expect(g.name).toBe('icon:lucide:Heart');
    expect(g.transform).toMatchObject({ x: 34, y: 34, scaleX: 2, scaleY: 2 });
    // Recoloured to the wireframe tone.
    expect((g.children[0] as { stroke: { paint: unknown } }).stroke.paint).toEqual(solid(WF.inkMuted));
    expect(takeMissingIcons()).toEqual([]);
  });

  it('harvests glyphs from stored children (a saved file keeps its icons)', () => {
    registerIcon('lucide:Heart', glyph());
    const stored = [icon('lucide:Heart', { x: 0, y: 0 })!];
    clearIconCache();
    expect(harvestIcons(stored)).toBe(1);
    expect((icon('heart', { x: 0, y: 0 }) as GroupNode).name).toBe('icon:lucide:Heart');
  });
});
