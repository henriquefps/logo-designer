import { describe, expect, it } from 'vitest';
import { defineComponent, defaultProps, resolveProps, validateProps } from '../types';
import { validateDocument } from '@/io/projectFile';

const def = defineComponent({
  kind: 'test-props',
  label: 'Test',
  platforms: 'all',
  category: 'Test',
  props: {
    title: { type: 'text', label: 'Title', default: 'Hi' },
    body: { type: 'multiline', label: 'Body', default: 'a\nb' },
    count: { type: 'number', label: 'Count', default: 3, min: 1, max: 10 },
    on: { type: 'boolean', label: 'On', default: true },
    variant: { type: 'choice', label: 'Variant', options: ['a', 'b'], default: 'a' },
    glyph: { type: 'icon', label: 'Icon', default: '' },
    tabs: { type: 'list', label: 'Tabs', default: ['One', 'Two'], max: 3 },
  },
  sizing: { width: 'fill', height: 'hug' },
  defaultSize: { width: 100, height: 10 },
  build: () => ({ children: [], height: 10 }),
  describe: () => '',
});

describe('component props', () => {
  it('fills every default', () => {
    expect(defaultProps(def)).toEqual({ title: 'Hi', body: 'a\nb', count: 3, on: true, variant: 'a', glyph: '', tabs: ['One', 'Two'] });
  });

  it('resolveProps replaces wrong types by the default and clamps numbers, never throws', () => {
    const p = resolveProps(def, { title: 5, count: 99, on: 'yes', variant: 'c', glyph: null, tabs: ['x', 1] });
    expect(p).toEqual({ title: 'Hi', body: 'a\nb', count: 10, on: true, variant: 'a', glyph: '', tabs: ['One', 'Two'] });
    expect(resolveProps(def, null as unknown as Record<string, unknown>).title).toBe('Hi');
  });

  it('defaults are copies (editing a resolved list does not change the definition)', () => {
    const p = resolveProps(def, {});
    p.tabs.push('Three');
    expect(def.props.tabs.default).toEqual(['One', 'Two']);
  });

  it('validateProps reports bad values, drops them, clamps numbers and keeps unknown keys', () => {
    const { props, problems } = validateProps(def, { title: 5, count: 99, variant: 'c', tabs: ['a', 'b', 'c', 'd'], future: { x: 1 }, on: false });
    expect(props).toEqual({ count: 10, tabs: ['a', 'b', 'c'], future: { x: 1 }, on: false });
    expect(problems.map((p) => p.key)).toEqual(['title', 'count', 'variant', 'tabs']);
    expect(problems[2].message).toMatch(/expected one of "a", "b", got "c"; using the default/);
    expect(problems[1].message).toMatch(/out of range.*clamped/);
  });
});

describe('props on load', () => {
  it('a file with bad prop values loads with warnings and defaults', () => {
    const warnings: string[] = [];
    const doc = validateDocument(
      {
        schemaVersion: 1,
        artboard: { width: 100, height: 100 },
        wireframe: { screens: [{ id: 's1', name: 'Home' }] },
        children: [
          {
            type: 'group',
            screen: { screenId: 's1', platform: 'phone' },
            children: [{ type: 'group', component: { kind: 'list-row', props: { title: 'Wi-Fi', trailing: 'sparkles', checked: 'yes' } }, children: [] }],
          },
        ],
      },
      { warnings },
    );
    const row = (doc.children[0] as { children: { component?: { props: Record<string, unknown> } }[] }).children[0];
    expect(row.component?.props).toEqual({ title: 'Wi-Fi' });
    expect(warnings).toEqual([
      expect.stringMatching(/children\[0\]\.children\[0\]\.component\.props\.trailing: expected one of "none", "chevron".*got "sparkles"; using the default/),
      expect.stringMatching(/component\.props\.checked: expected true or false, got "yes"/),
    ]);
  });
});

describe('conditional props (visibleWhen)', () => {
  it('list row: Icon only for a leading icon, Value only for a value, On only for toggle/checkbox', async () => {
    const { default: row } = await import('../list-row');
    const { isPropVisible } = await import('../types');
    const shown = (raw: Record<string, unknown>) => {
      const p = resolveProps(row, raw);
      return Object.entries(row.props).filter(([, s]) => isPropVisible(s, p)).map(([k]) => k);
    };
    expect(shown({})).toEqual(['title', 'subtitle', 'leading', 'trailing', 'divider']);
    expect(shown({ leading: 'icon', trailing: 'value' })).toEqual(['title', 'subtitle', 'leading', 'leadingIcon', 'trailing', 'value', 'divider']);
    expect(shown({ trailing: 'toggle' })).toContain('checked');
    expect(shown({ trailing: 'checkbox' })).toContain('checked');
    expect(shown({ trailing: 'chevron' })).not.toContain('checked');
  });
});
