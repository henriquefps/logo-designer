// Every component in the library honours the contract (docs/architecture.md → Adding a component).
// New components get these checks for free.
import { describe, expect, it } from 'vitest';
import { boundsIn, fromTransform, type Paint, type SceneNode } from '@/model';
import { WF } from '../../style';
import { getComponents } from '../registry';
import { defaultProps, resolveProps, type PropSpec } from '../types';

const ALLOWED = new Set<string>((Object.values(WF) as unknown[]).filter((v): v is string => typeof v === 'string' && v.startsWith('#')));
const colors = (n: SceneNode, out: string[] = []): string[] => {
  const p = (x: Paint) => x.kind === 'solid' && out.push(x.color);
  if (n.type === 'group') n.children.forEach((c) => colors(c, out));
  else if (n.type !== 'image') {
    p(n.fill);
    p(n.stroke.paint);
  }
  return out;
};
const strip = (nodes: SceneNode[]): unknown => JSON.parse(JSON.stringify(nodes, (k, v) => (k === 'id' ? undefined : v)));

/** A different valid value per prop type, to exercise build with non-default props. */
function other(spec: PropSpec): unknown {
  switch (spec.type) {
    case 'number':
      return Math.min(spec.max ?? Infinity, spec.default + (spec.step ?? 1));
    case 'boolean':
      return !spec.default;
    case 'choice':
      return spec.options[spec.options.length - 1];
    case 'list':
      return ['Alpha', 'Beta', 'Gamma'];
    case 'icon':
      return spec.default ? '' : 'lucide:Star';
    default:
      return spec.default ? '' : 'Some text';
  }
}

describe.each(getComponents().map((d) => [d.kind, d] as const))('component %s', (_kind, def) => {
  it('has a kebab-case kind, a label, a category and sensible sizes', () => {
    expect(def.kind).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(def.label).toBeTruthy();
    expect(def.category).toBeTruthy();
    expect(def.defaultSize.width).toBeGreaterThan(0);
  });

  it('defaults are valid for their specs', () => {
    for (const [key, spec] of Object.entries(def.props as Record<string, PropSpec>)) {
      if (spec.type === 'choice') expect(spec.options, key).toContain(spec.default);
      if (spec.type === 'number') {
        expect(spec.default, key).toBeGreaterThanOrEqual(spec.min ?? -Infinity);
        expect(spec.default, key).toBeLessThanOrEqual(spec.max ?? Infinity);
      }
    }
  });

  it('builds with default props: children inside the box, wireframe colours only, deterministic', () => {
    const props = defaultProps(def);
    const width = def.defaultSize.width;
    const r = def.build(props, { width });
    expect(r.height).toBeGreaterThan(0);
    expect(r.children.length).toBeGreaterThan(0);
    for (const c of r.children) {
      const b = boundsIn(c, fromTransform(c.transform));
      if (!b) continue;
      expect(b.x, c.name).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, c.name).toBeLessThanOrEqual(width + 1);
      expect(b.y, c.name).toBeGreaterThanOrEqual(-1);
      expect(b.y + b.height, c.name).toBeLessThanOrEqual(r.height + 1);
      for (const col of colors(c)) expect(ALLOWED.has(col), `${c.name} uses ${col}`).toBe(true);
    }
    expect(strip(def.build(props, { width }).children)).toEqual(strip(r.children));
    expect(def.describe(props)).toBeTruthy();
  });

  it('builds with every prop changed, and at narrow and wide widths, without throwing', () => {
    for (const [key, spec] of Object.entries(def.props as Record<string, PropSpec>)) {
      const props = resolveProps(def, { [key]: other(spec) });
      for (const width of [40, def.defaultSize.width, 1440]) expect(() => def.build(props, { width }), `${key} @ ${width}`).not.toThrow();
      expect(typeof def.describe(props)).toBe('string');
    }
  });
});
