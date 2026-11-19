import { afterEach, describe, expect, it } from 'vitest';
import { boundsIn, fromTransform, createPath, solid, type GroupNode, type RectNode, type SceneNode, type TextNode } from '@/model';
import { clearIconCache, registerIcon } from '../../icons';
import { WF, WF_SIZE } from '../../style';
import button from '../button';
import heading from '../heading';
import listRow from '../list-row';
import { resolveProps } from '../types';

afterEach(() => clearIconCache());

const names = (children: SceneNode[]) => children.map((c) => c.name);
const find = (children: SceneNode[], name: string) => children.find((c) => c.name === name);
const texts = (nodes: SceneNode[]): string[] => nodes.flatMap((n) => (n.type === 'text' ? [n.text] : n.type === 'group' ? texts(n.children) : []));
const bounds = (n: SceneNode) => boundsIn(n, fromTransform(n.transform))!;
const glyph = () => createPath({ name: 'g', subpaths: [{ closed: false, points: [{ x: -12, y: 0, type: 'corner' }, { x: 12, y: 0, type: 'corner' }] }], stroke: { paint: solid('#000000'), width: 2, cap: 'round', join: 'round', dash: [] } });

describe('heading', () => {
  it('sizes by level and aligns', () => {
    const p = resolveProps(heading, { text: 'Settings', level: 'title', align: 'center' });
    const r = heading.build(p, { width: 300 });
    expect(r.height).toBe(Math.ceil(28 * 1.25));
    const t = r.children[0] as TextNode;
    expect(t).toMatchObject({ text: 'Settings', fontSize: 28, align: 'center' });
    expect(t.transform.x).toBe(150);
    expect(heading.build(resolveProps(heading, { level: 'subheading' }), { width: 300 }).height).toBe(Math.ceil(18 * 1.3));
  });
  it('describes itself', () => {
    expect(heading.describe(resolveProps(heading, { text: 'Settings', level: 'title' }))).toBe('Title "Settings"');
    expect(heading.describe(resolveProps(heading, { text: 'Account', align: 'center' }))).toBe('Heading "Account" (center aligned)');
  });
});

describe('button', () => {
  it('primary is a filled box with a light label, at the control height', () => {
    const r = button.build(resolveProps(button, { label: 'Save' }), { width: 200 });
    expect(r.height).toBe(WF_SIZE.control);
    expect(names(r.children)).toEqual(['Background', 'Label']);
    const bg = r.children[0] as RectNode;
    expect(bg).toMatchObject({ width: 200, height: 44, fill: solid(WF.ink) });
    expect((r.children[1] as TextNode).fill).toEqual(solid(WF.paper));
    // Hug width: label + padding.
    expect(r.width).toBeGreaterThan(48);
    expect(r.width).toBeLessThan(200);
  });
  it('secondary is outlined, text has no box', () => {
    const sec = button.build(resolveProps(button, { variant: 'secondary' }), { width: 120 });
    expect((sec.children[0] as RectNode).stroke.paint).toEqual(solid(WF.ink));
    expect((sec.children[0] as RectNode).fill).toEqual(solid(WF.paper));
    const txt = button.build(resolveProps(button, { variant: 'text' }), { width: 120 });
    expect(names(txt.children)).toEqual(['Label']);
    expect((txt.children[0] as TextNode).fill).toEqual(solid(WF.ink));
  });
  it('an icon goes before the label and widens the hug width', () => {
    registerIcon('lucide:Plus', glyph());
    const plain = button.build(resolveProps(button, { label: 'Add' }), { width: 160 });
    const withIcon = button.build(resolveProps(button, { label: 'Add', icon: 'lucide:Plus' }), { width: 160 });
    expect(names(withIcon.children)).toEqual(['Background', 'icon:lucide:Plus', 'Label']);
    expect(withIcon.width! - plain.width!).toBe(WF_SIZE.icon + 8);
    const ic = bounds(withIcon.children[1]);
    expect(ic.x + ic.width).toBeLessThanOrEqual((withIcon.children[2] as TextNode).transform.x);
  });
  it('describes itself', () => {
    expect(button.describe(resolveProps(button, { label: 'Save' }))).toBe('Primary button "Save"');
    expect(button.describe(resolveProps(button, { label: 'Add', variant: 'text', icon: 'lucide:Plus' }))).toBe('Text button "Add" with icon Plus');
  });
});

describe('list row', () => {
  const build = (props: Record<string, unknown>, width = 390) => listRow.build(resolveProps(listRow, props), { width });

  it('one line is 56 tall, with a subtitle 72', () => {
    expect(build({}).height).toBe(56);
    expect(build({ subtitle: 'English' }).height).toBe(72);
  });

  it('default: title and a chevron on the right', () => {
    const r = build({ title: 'Language' });
    expect(names(r.children)).toEqual(['Title', 'Trailing']);
    expect(texts(r.children)).toEqual(['Language']);
    const ch = bounds(r.children[1]);
    expect(ch.x + ch.width).toBeLessThanOrEqual(390 - 16);
  });

  it('leading icon / avatar push the title right', () => {
    const none = (build({}).children[0] as TextNode).transform.x;
    const withIcon = build({ leading: 'icon', leadingIcon: 'lucide:Globe' });
    expect(names(withIcon.children)[0]).toBe('Leading');
    expect((find(withIcon.children, 'Title') as TextNode).transform.x).toBe(none + 24 + 16);
    const withAvatar = build({ leading: 'avatar' });
    expect((find(withAvatar.children, 'Title') as TextNode).transform.x).toBe(none + 40 + 16);
    // Leading icon without a name: nothing on the left.
    expect(names(build({ leading: 'icon', leadingIcon: '' }).children)[0]).toBe('Title');
  });

  it('trailing variants', () => {
    expect(texts(build({ trailing: 'value', value: 'English' }).children)).toEqual(['Title', 'English']);
    expect(find(build({ trailing: 'value', value: 'English' }).children, 'Trailing')).toBeTruthy();
    const tog = (find(build({ trailing: 'toggle', checked: false }).children, 'Trailing') as GroupNode).children[0] as GroupNode;
    expect(tog.name).toBe('Toggle');
    expect((tog.children[0] as RectNode).fill).toEqual(solid(WF.fill));
    const cb = (find(build({ trailing: 'checkbox' }).children, 'Trailing') as GroupNode).children[0];
    expect(cb.name).toBe('Checkbox');
    expect(find(build({ trailing: 'none' }).children, 'Trailing')).toBeUndefined();
  });

  it('long titles are truncated before the trailing part', () => {
    const r = build({ title: 'A very long title that would run into the value on the right', trailing: 'value', value: 'Something' }, 300);
    const title = find(r.children, 'Title') as TextNode;
    expect(title.text.endsWith('…')).toBe(true);
    const tb = bounds(title);
    const vb = bounds(find(r.children, 'Trailing')!);
    expect(tb.x + tb.width).toBeLessThanOrEqual(vb.x);
  });

  it('divider at the bottom', () => {
    const r = build({ divider: true });
    expect(names(r.children)).toContain('Divider');
    expect(bounds(find(r.children, 'Divider')!).y).toBeCloseTo(55.5);
  });

  it('describes itself', () => {
    expect(listRow.describe(resolveProps(listRow, { title: 'Language', trailing: 'value', value: 'English' }))).toBe('List row "Language", → value "English"');
    expect(listRow.describe(resolveProps(listRow, { title: 'Wi-Fi', subtitle: 'Home', leading: 'icon', leadingIcon: 'lucide:Wifi', trailing: 'toggle' }))).toBe(
      'List row "Wi-Fi", subtitle "Home", leading icon Wifi, → toggle (on)',
    );
    expect(listRow.describe(resolveProps(listRow, { title: 'Ana', leading: 'avatar', trailing: 'none' }))).toBe('List row "Ana", leading avatar');
  });
});
