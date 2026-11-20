// Every component in the library honours the contract (docs/architecture.md → Adding a component).
// New components get these checks for free.
import { describe, expect, it } from 'vitest';
import { boundsIn, fromTransform, type Paint, type SceneNode } from '@/model';
import { WF } from '../../style';
import { getComponents } from '../registry';
import { AUTO, defaultProps, initialProps, resizableAxes, resolveProps, type PropSpec } from '../types';

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

  it('visibleWhen only references other existing props, with values they can take', () => {
    const specs = def.props as Record<string, PropSpec>;
    for (const [key, spec] of Object.entries(specs)) {
      for (const [ref, cond] of Object.entries(spec.visibleWhen ?? {})) {
        expect(ref, `${key}.visibleWhen`).not.toBe(key);
        const target = specs[ref];
        expect(target, `${key}.visibleWhen references unknown prop "${ref}"`).toBeDefined();
        for (const v of Array.isArray(cond) ? cond : [cond]) {
          if (target.type === 'choice') expect(target.options, `${key}.visibleWhen.${ref}`).toContain(v);
          else if (target.type === 'boolean') expect(typeof v, `${key}.visibleWhen.${ref}`).toBe('boolean');
          else if (target.type === 'number') expect(typeof v, `${key}.visibleWhen.${ref}`).toBe('number');
          else expect(typeof v, `${key}.visibleWhen.${ref}`).toBe('string');
        }
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

  it('follows the size it is given, or says it cannot (resizable axes)', () => {
    const axes = resizableAxes(def);
    expect(typeof axes.width).toBe('boolean');
    expect(typeof axes.height).toBe('boolean');
    const props = defaultProps(def);
    const width = def.defaultSize.width;
    const base = def.build(props, { width });
    const taller = def.build(props, { width, height: Math.ceil(base.height) + 120 });
    if (axes.height) {
      // Taller box → taller drawing, with everything still inside it.
      expect(taller.height).toBeGreaterThan(base.height);
      for (const c of taller.children) {
        const b = boundsIn(c, fromTransform(c.transform));
        if (b) expect(b.y + b.height, c.name).toBeLessThanOrEqual(taller.height + 1);
      }
      // A box shorter than the content never makes the drawing shorter than the content.
      expect(def.build(props, { width, height: 1 }).height).toBeGreaterThanOrEqual(Math.min(base.height, 1));
    } else {
      // A height that follows the content ignores any height it is given.
      expect(taller.height).toBe(base.height);
      expect(strip(taller.children)).toEqual(strip(base.children));
    }
    if (!axes.width) expect(strip(def.build(props, { width: width + 100 }).children)).toEqual(strip(base.children));
  });

  it('declares parts inside its box, with unique keys and labels (links from parts)', () => {
    if (!def.parts) return;
    const lists = def.partLists ?? {};
    for (const prop of Object.values(lists)) expect((def.props as Record<string, PropSpec>)[prop]?.type, `partLists → ${prop}`).toBe('list');
    const variants: Record<string, unknown>[] = [{}];
    for (const [key, spec] of Object.entries(def.props as Record<string, PropSpec>)) variants.push({ [key]: other(spec) });
    let some = false;
    for (const raw of variants) {
      const props = resolveProps(def, raw);
      for (const width of [def.defaultSize.width, 1440]) {
        const built = def.build(props, { width });
        const parts = def.parts(props, { width, height: built.height });
        some ||= parts.length > 0;
        expect(new Set(parts.map((x) => x.key)).size, `${JSON.stringify(raw)} @ ${width}: keys are unique`).toBe(parts.length);
        for (const part of parts) {
          const r = part.rect;
          const at = `${part.key} (${JSON.stringify(raw)} @ ${width})`;
          expect(part.label.trim(), at).toBeTruthy();
          expect(r.width, at).toBeGreaterThan(0);
          expect(r.height, at).toBeGreaterThan(0);
          expect(r.x, at).toBeGreaterThanOrEqual(-0.5);
          expect(r.y, at).toBeGreaterThanOrEqual(-0.5);
          expect(r.x + r.width, at).toBeLessThanOrEqual(width + 0.5);
          expect(r.y + r.height, at).toBeLessThanOrEqual(built.height + 0.5);
          const m = /^([a-z][a-z-]*):(\d+)$/.exec(part.key);
          if (m && lists[m[1]]) {
            // A list part's label is its entry, so a reorder finds it again.
            const list = (props as Record<string, unknown>)[lists[m[1]]] as string[];
            expect(list[Number(m[2])]?.trim(), at).toBe(part.label.trim());
          }
          if (def.selectFromPart) expect(['number', 'object'], at).toContain(typeof def.selectFromPart(props, part.key));
        }
      }
    }
    expect(some, 'at least one variant has parts').toBe(true);
  });

  it('an "auto" prop is valid, starts as auto when it says so, and never reaches build', () => {
    for (const [key, spec] of Object.entries(def.props as Record<string, PropSpec>)) {
      if (spec.type !== 'number' || !spec.auto) continue;
      expect(def.selectFromPart, `${key} is auto: the definition says which part selects what`).toBeTypeOf('function');
      if (spec.auto.default) expect(initialProps(def)[key]).toBe(AUTO);
      const props = resolveProps(def, { [key]: AUTO });
      expect((props as Record<string, unknown>)[key]).toBe(spec.default);
      expect((resolveProps(def, { [key]: AUTO }, { [key]: 2 }) as Record<string, unknown>)[key]).toBe(2);
      expect(() => def.build(props, { width: def.defaultSize.width })).not.toThrow();
    }
  });
});

describe('library parts', () => {
  const kinds = ['bottom-navigation', 'tabs', 'segmented-control', 'sidebar-nav', 'web-header', 'breadcrumbs', 'toolbar', 'top-app-bar', 'bottom-sheet', 'dialog', 'modal', 'card', 'section-header', 'snackbar', 'pagination'];
  it.each(kinds)('%s declares its parts', (kind) => {
    expect(getComponents().find((d) => d.kind === kind)?.parts, kind).toBeTypeOf('function');
  });
  it.each(['bottom-navigation', 'tabs', 'segmented-control', 'sidebar-nav', 'web-header'])('%s selects the item that follows the screen by default', (kind) => {
    const def = getComponents().find((d) => d.kind === kind)!;
    expect(initialProps(def).selected).toBe(AUTO);
  });
});

