import { describe, expect, it } from 'vitest';
import { BRAND, IOS_DARK_GLYPH, type IconSources } from '@/icon';
import { androidThemedColors, androidThemedSvg, iosAppearanceSvg, safeTint } from '../themedPreview';

const sources: IconSources = { glyph: { src: '<rect x="40" y="30" width="48" height="68" fill="currentColor"/>', box: { x: 40, y: 30, w: 48, h: 68, inkArea: 3264 } }, shape: 'tall' };
const lightness = (c: string) => Number(/ ([\d.]+)%\)$/.exec(c)![1]);

describe('themed previews', () => {
  it('Android: dark glyph on a light tonal shape in light mode, the reverse in dark mode', () => {
    const light = androidThemedColors('#2063b0', false);
    const dark = androidThemedColors('#2063b0', true);
    expect(lightness(light.bg)).toBeGreaterThan(80);
    expect(lightness(light.fg)).toBeLessThan(30);
    expect(lightness(dark.bg)).toBeLessThan(30);
    expect(lightness(dark.fg)).toBeGreaterThan(80);
    const svg = androidThemedSvg(sources, '#2063b0', true);
    expect(svg).toContain('<circle cx="64" cy="64" r="64"');
    expect(svg).not.toContain('currentColor');
  });

  it('iOS: Light = brand tile, Dark = dark glyph colour, Tinted follows the tint', () => {
    expect(iosAppearanceSvg(sources, 'light', '#ff0000')).toContain(BRAND);
    expect(iosAppearanceSvg(sources, 'dark', '#ff0000')).toContain(IOS_DARK_GLYPH);
    const a = iosAppearanceSvg(sources, 'tinted', '#ff0000');
    const b = iosAppearanceSvg(sources, 'tinted', '#00ff00');
    expect(a).not.toBe(b);
    expect(a).toContain('hsl(0.0 ');
  });

  it('bad tints fall back to the default', () => {
    expect(safeTint('nope')).toMatch(/^#[0-9a-f]{6}$/);
    expect(safeTint('#ABCDEF')).toBe('#ABCDEF');
  });
});
