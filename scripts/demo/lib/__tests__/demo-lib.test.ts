// The demo recorder's pure parts: the ffmpeg filter for sped-up and cut parts, where a moment of the recording lands
// in the video, and the hfps tokens of the overlay. The promo's Roam fixture: src/wireframe/spec/__tests__/demoFixtures.test.ts.
import { describe, expect, it } from 'vitest';
import { speedFilter, videoTime } from '../encode.ts';
import { hfpsTokens, PALETTES, tokensCss } from '../hfps.ts';

describe('speedFilter', () => {
  it('plays a sped-up part faster and keeps the rest', () => {
    const f = speedFilter([{ start: 12, end: 22, factor: 8 }], 2, 25);
    expect(f).toContain('[0:v]trim=start=0.000:end=10.000,setpts=(PTS-STARTPTS)[v0]');
    expect(f).toContain('[0:v]trim=start=10.000:end=20.000,setpts=(PTS-STARTPTS)/8[v1]');
    expect(f).toContain('[0:v]trim=start=20.000,setpts=(PTS-STARTPTS)[v2]');
    expect(f).toContain('[v0][v1][v2]concat=n=3');
  });

  it('leaves a cut part out (factor Infinity)', () => {
    const f = speedFilter([{ start: 5, end: 9, factor: Infinity }], 0, 25);
    expect(f).toContain('trim=start=0.000:end=5.000,setpts=(PTS-STARTPTS)[v0]');
    expect(f).toContain('trim=start=9.000,setpts=(PTS-STARTPTS)[v1]');
    expect(f).toContain('[v0][v1]concat=n=2');
    expect(f).not.toContain('Infinity');
  });

  it('mixes cut and sped-up parts in order', () => {
    const f = speedFilter([{ start: 20, end: 30, factor: 10 }, { start: 5, end: 8, factor: Infinity }], 0, 25);
    expect(f).toContain('[v0][v1][v2][v3]concat=n=4');
    expect(f).toContain('trim=start=8.000:end=20.000,setpts=(PTS-STARTPTS)[v1]');
    expect(f).toContain('trim=start=20.000:end=30.000,setpts=(PTS-STARTPTS)/10[v2]');
  });
});

describe('videoTime', () => {
  const segs = [{ start: 10, end: 20, factor: 5 }, { start: 30, end: 34, factor: Infinity }];
  it('takes out the setup', () => expect(videoTime(8, 2, segs)).toBe(6));
  it('takes out the time saved by a sped-up part', () => {
    expect(videoTime(15, 0, segs)).toBeCloseTo(11);
    expect(videoTime(25, 0, segs)).toBeCloseTo(17);
  });
  it('takes out a cut part entirely', () => {
    expect(videoTime(32, 0, segs)).toBeCloseTo(22);
    expect(videoTime(40, 0, segs)).toBeCloseTo(28);
  });
});

describe('hfps tokens', () => {
  it('derives the blue palette like hfps-tokens.css', () => {
    const t = hfpsTokens('blue');
    expect(t['--demo-accent']).toBe('oklch(0.5 0.14 255)');
    expect(t['--demo-bg']).toBe('oklch(0.966 0.0075 250)');
    expect(t['--demo-fg']).toBe('oklch(0.153 0.009 250)');
    expect(t['--demo-card']).toBe('oklch(1 0 0)');
    expect(t['--demo-accent-soft']).toBe('oklch(0.93 0.045 255)');
  });

  it('switches every colour with the palette', () => {
    expect(hfpsTokens('olive')['--demo-accent']).toBe('oklch(0.5 0.09 135)');
    expect(hfpsTokens('olive')['--demo-accent-soft']).toBe('oklch(0.93 0.045 135)');
    expect(hfpsTokens('rose')['--demo-bg']).toBe('oklch(0.966 0.006 5)');
    expect(Object.keys(PALETTES)).toEqual(['blue', 'olive', 'violet', 'rose', 'graphite']);
  });

  it('writes them as custom properties on :root, prefixed so they never clash with the app', () => {
    const css = tokensCss();
    expect(css.startsWith(':root {')).toBe(true);
    expect(css).toMatch(/--demo-accent: oklch\(0\.5 0\.14 255\);/);
    expect(css).not.toMatch(/[^-]--card:/);
  });
});
