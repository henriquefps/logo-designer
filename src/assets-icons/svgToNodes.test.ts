import { describe, expect, it } from 'vitest';
import { pathDataToSubpaths, parsePathData } from './svgPath';
import { resolveColor, svgToNodes } from './svgToNodes';
import type { GroupNode, PathNode } from '@/model/types';

describe('path data', () => {
  it('parses relative/implicit commands and closes', () => {
    const sp = pathDataToSubpaths('m1 1 2 0 0 2z');
    expect(sp).toHaveLength(1);
    expect(sp[0].closed).toBe(true);
    expect(sp[0].points.map((p) => [p.x, p.y])).toEqual([[1, 1], [3, 1], [3, 3]]);
  });
  it('merges closing point equal to the start and keeps handles', () => {
    const sp = pathDataToSubpaths('M0 0C0 1 1 1 1 0C1 -1 0 -1 0 0Z');
    expect(sp[0].points).toHaveLength(2);
    expect(sp[0].points[0].in).toEqual({ x: 0, y: -1 });
    expect(sp[0].points[0].out).toEqual({ x: 0, y: 1 });
  });
  it('H/V and smooth curves', () => {
    const segs = parsePathData('M0 0H5V5S6 6 7 7');
    expect(segs).toHaveLength(4);
    expect(segs[3]).toMatchObject({ t: 'C', c1: { x: 5, y: 5 }, x: 7, y: 7 });
  });
  it('arcs become cubics ending on target', () => {
    const segs = parsePathData('M0 0A5 5 0 0 1 10 0');
    expect(segs.length).toBeGreaterThan(1);
    const last = segs[segs.length - 1];
    expect(last).toMatchObject({ t: 'C', x: 10, y: 0 });
  });
  it('stops on garbage instead of throwing', () => {
    expect(() => parsePathData('M0 0 L 5')).not.toThrow();
  });
});

describe('resolveColor', () => {
  it('handles currentColor, none, hex and rgb', () => {
    expect(resolveColor('currentColor', '#112233')).toBe('#112233');
    expect(resolveColor('none', '#112233')).toBeNull();
    expect(resolveColor('#abc', '#000000')).toBe('#aabbcc');
    expect(resolveColor('rgb(255, 0, 0)', '#000000')).toBe('#ff0000');
    expect(resolveColor('url(#g)', '#123456')).toBe('#123456');
  });
});

const lucide = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2L22 22"></path><circle cx="12" cy="12" r="4"/></svg>';

describe('svgToNodes', () => {
  it('keeps stroke, fill none, and replaces currentColor (lucide)', () => {
    const g = svgToNodes(lucide, { color: '#ff0000', size: 120 }) as GroupNode;
    expect(g.type).toBe('group');
    expect(g.children).toHaveLength(2);
    const p = g.children[0] as PathNode;
    expect(p.fill.kind).toBe('none');
    expect(p.stroke.paint).toEqual({ kind: 'solid', color: '#ff0000' });
    expect(p.stroke.width).toBeCloseTo(10); // 2 * 120/24
    expect(p.stroke.cap).toBe('round');
    // centered and scaled: (2,2) -> (-50,-50)
    expect(p.subpaths[0].points[0]).toMatchObject({ x: -50, y: -50 });
  });
  it('overrides stroke width in icon units', () => {
    const g = svgToNodes(lucide, { color: '#000000', size: 24, strokeWidth: 1 }) as GroupNode;
    expect((g.children[0] as PathNode).stroke.width).toBe(1);
  });
  it('fill icons (phosphor): fill=currentColor, opacity attr, single path returned bare', () => {
    const svg = '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M0 0H256V256Z" opacity="0.2"></path></svg>';
    const n = svgToNodes(svg, { color: '#00ff00', size: 256 }) as PathNode;
    expect(n.type).toBe('path');
    expect(n.fill).toEqual({ kind: 'solid', color: '#00ff00' });
    expect(n.stroke.paint.kind).toBe('none');
    expect(n.opacity).toBe(0.2);
    expect(n.subpaths[0].points[0]).toMatchObject({ x: -128, y: -128 });
  });
  it('applies transforms and skips defs', () => {
    const svg = '<svg viewBox="0 0 10 10"><defs><path d="M0 0L1 1"/></defs><g transform="translate(5 5)"><rect width="2" height="2"/></g></svg>';
    const n = svgToNodes(svg, { color: '#000000', size: 10 }) as PathNode;
    expect(n.type).toBe('path');
    expect(n.subpaths[0].points[0]).toMatchObject({ x: 0, y: 0 });
  });
  it('returns null when nothing drawable', () => {
    expect(svgToNodes('<svg viewBox="0 0 1 1"></svg>', { color: '#000', size: 1 })).toBeNull();
    expect(svgToNodes('not svg', { color: '#000', size: 1 })).toBeNull();
  });
});
