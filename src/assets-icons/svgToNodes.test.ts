// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { svgToNodes } from './svgToNodes';
import type { GroupNode, PathNode } from '@/model/types';

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
  it('uses the full importer: <style> classes, gradients and <use>', () => {
    const svg =
      '<svg viewBox="0 0 20 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><style>.a{fill:#123456}</style></defs>' +
      '<rect id="r" class="a" width="10" height="10"/><use href="#r" x="10" fill="url(#g)"/><circle cx="15" cy="5" r="2" fill="url(#g)"/></svg>';
    const g = svgToNodes(svg, { color: '#000000', size: 20 }) as GroupNode;
    expect(g.type).toBe('group');
    const kinds = g.children.map((c) => (c as PathNode).fill.kind);
    expect((g.children[0] as PathNode).fill).toEqual({ kind: 'solid', color: '#123456' });
    expect(kinds).toContain('linear');
    expect(g.children.every((c) => c.type === 'path' && c.transform.x === 0 && c.transform.y === 0)).toBe(true);
  });
  it('returns null when nothing drawable', () => {
    expect(svgToNodes('<svg viewBox="0 0 1 1"></svg>', { color: '#000', size: 1 })).toBeNull();
    expect(svgToNodes('not svg', { color: '#000', size: 1 })).toBeNull();
  });
});
