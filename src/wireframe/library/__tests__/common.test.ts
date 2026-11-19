import { describe, expect, it } from 'vitest';
import type { SceneNode, TextNode } from '@/model';
import { WF_SIZE } from '../../style';
import { getComponent } from '../registry';
import { resolveProps } from '../types';

const get = (kind: string) => {
  const def = getComponent(kind);
  if (!def) throw new Error(`no component ${kind}`);
  return def;
};
const build = (kind: string, raw: Record<string, unknown> = {}, width = 300, height?: number) => {
  const def = get(kind);
  return def.build(resolveProps(def, raw), { width, height });
};
const desc = (kind: string, raw: Record<string, unknown> = {}) => {
  const def = get(kind);
  return def.describe(resolveProps(def, raw));
};
const texts = (nodes: SceneNode[]): string[] => nodes.flatMap((n) => (n.type === 'text' ? [n.text] : n.type === 'group' ? texts(n.children) : []));
const names = (nodes: SceneNode[]) => nodes.map((n) => n.name);

describe('common library', () => {
  it('registers every common component under the agreed categories', () => {
    const kinds = ['text', 'paragraph', 'text-field', 'text-area', 'select', 'checkbox', 'radio-group', 'toggle', 'slider', 'image', 'avatar', 'icon', 'chip', 'divider', 'card', 'progress', 'empty-state', 'search-field'];
    const cats = new Set(['Text', 'Inputs', 'Media', 'Content', 'Feedback']);
    for (const k of kinds) {
      expect(get(k).platforms, k).toBe('all');
      expect(cats.has(get(k).category), k).toBe(true);
    }
  });

  it('text wraps real words to the width and describes itself', () => {
    const long = 'word '.repeat(40).trim();
    const narrow = build('text', { text: long }, 120);
    const wide = build('text', { text: long }, 600);
    expect(narrow.height).toBeGreaterThan(wide.height);
    expect((narrow.children[0] as TextNode).text.split('\n').length).toBeGreaterThan(1);
    expect(desc('text', { text: 'Hello', size: 'caption', tone: 'muted' })).toBe('Text "Hello" (caption), secondary');
  });

  it('paragraph is grey bars, one per line', () => {
    const r = build('paragraph', { lines: 4 });
    expect(r.children[0].type).toBe('group');
    expect((r.children[0] as { children: SceneNode[] }).children).toHaveLength(4);
    expect(desc('paragraph', { lines: 1 })).toContain('1 line ');
    expect(desc('paragraph', { lines: 5 })).toContain('5 lines');
  });

  it('text field: height by label and helper, states, describe', () => {
    expect(build('text-field', { label: '', helper: '' }).height).toBe(WF_SIZE.control);
    const withLabel = build('text-field', { label: 'Email' }).height;
    expect(withLabel).toBeGreaterThan(WF_SIZE.control);
    expect(build('text-field', { label: 'Email', helper: 'We never share it' }).height).toBeGreaterThan(withLabel);
    const err = build('text-field', { state: 'error', error: 'Required' });
    expect(texts(err.children)).toContain('Required');
    expect(names(err.children)).toContain('Error mark');
    expect(names(build('text-field', { state: 'focused', value: 'abc' }).children)).toContain('Caret');
    expect(desc('text-field', { label: 'Email', placeholder: 'you@example.com', state: 'error', error: 'Required', inputType: 'email' })).toBe('Text field "Email", type email, placeholder "you@example.com", error "Required"');
    expect(desc('text-field', { label: 'Name', value: 'Ada', helper: 'As on your ID', icon: 'lucide:User' })).toBe('Text field "Name", value "Ada", leading icon User, helper "As on your ID"');
  });

  it('text field masks passwords', () => {
    expect(texts(build('text-field', { inputType: 'password', value: 'secret' }).children)).toContain('••••••');
  });

  it('text area grows with rows', () => {
    const a = build('text-area', { rows: 3, label: '' }).height;
    const b = build('text-area', { rows: 6, label: '' }).height;
    expect(b).toBeGreaterThan(a);
    expect(desc('text-area', { label: 'Bio', rows: 5, placeholder: 'Tell us' })).toBe('Text area "Bio", 5 rows, placeholder "Tell us"');
  });

  it('select shows value or placeholder, lists options in describe', () => {
    expect(texts(build('select', { value: 'Brazil' }).children)).toContain('Brazil');
    expect(texts(build('select', { value: '' }).children)).toContain('Select an option');
    expect(names(build('select').children)).toContain('Chevron');
    expect(desc('select', { label: 'Country', value: 'Brazil', options: ['Brazil', 'Chile'] })).toBe('Select "Country", value "Brazil", options: "Brazil", "Chile"');
  });

  it('checkbox, toggle and radio group describe their state', () => {
    expect(desc('checkbox', { label: 'Remember me', checked: true })).toBe('Checkbox "Remember me" (checked)');
    expect(desc('toggle', { label: 'Notifications', on: false })).toBe('Toggle "Notifications" (off)');
    expect(build('toggle', { description: 'Push alerts' }).height).toBe(56);
    expect(build('toggle').height).toBe(40);
    expect(desc('radio-group', { label: 'Plan', options: ['Free', 'Pro'], selected: 2 })).toBe('Radio group "Plan": "Free", "Pro" (selected)');
    expect(desc('radio-group', { label: '', options: ['A'], selected: 0 })).toBe('Radio group: "A" (none selected)');
  });

  it('radio group has a row per option', () => {
    const none = build('radio-group', { label: '', options: ['a', 'b', 'c'] }).height;
    expect(none).toBe(96);
    expect(build('radio-group', { label: 'Pick', options: ['a', 'b', 'c'] }).height).toBeGreaterThan(none);
  });

  it('slider and progress fill proportionally', () => {
    const w = (kind: string, value: number, name: string) => {
      const r = build(kind, { value, label: '' }, 200);
      const n = r.children.find((c) => c.name === name);
      return n && n.type === 'rect' ? n.width : 0;
    };
    expect(w('progress', 50, 'Progress')).toBe(100);
    expect(w('slider', 100, 'Progress')).toBe(200 - 10);
    expect(w('slider', 0, 'Progress')).toBe(10);
    expect(desc('slider', { label: 'Volume', value: 30 })).toBe('Slider "Volume", value 30 of 100');
    expect(desc('progress', { label: 'Uploading', value: 60 })).toBe('Progress bar "Uploading", 60% complete');
  });

  it('image uses the aspect ratio, or the given height when free', () => {
    expect(build('image', { ratio: '1:1' }, 200).height).toBe(200);
    expect(build('image', { ratio: '16:9' }, 320).height).toBe(180);
    expect(build('image', { ratio: '4:3' }, 200).height).toBe(150);
    expect(build('image', { ratio: '3:4' }, 150).height).toBe(200);
    expect(build('image', { ratio: 'free' }, 200, 90).height).toBe(90);
    expect(build('image', { ratio: '1:1', caption: 'A photo' }, 200).height).toBeGreaterThan(200);
    expect(desc('image', { ratio: '4:3', subject: 'a product photo', caption: 'Front view' })).toBe('Image 4:3 (placeholder), showing a product photo, caption "Front view"');
  });

  it('avatar and icon hug their size', () => {
    expect(build('avatar', { size: 'large' }).width).toBe(64);
    expect(build('avatar', { size: 'small' }).height).toBe(32);
    expect(texts(build('avatar', { initials: 'jo' }).children)).toEqual(['JO']);
    expect(names(build('avatar', { content: 'image' }).children)).toEqual(['Avatar']);
    expect(desc('avatar', { size: 'large', initials: 'jd' })).toBe('Avatar (large, initials "JD")');
    expect(desc('avatar', { content: 'image' })).toBe('Avatar (medium, image)');
    const ic = build('icon', { size: 48 });
    expect([ic.width, ic.height]).toEqual([48, 48]);
    expect(desc('icon', { icon: 'lucide:Heart', size: 32 })).toBe('Icon Heart, 32px');
  });

  it('chip hugs its label; selected is filled; close widens it', () => {
    const plain = build('chip', { label: 'Filter' });
    expect(plain.height).toBe(WF_SIZE.controlSmall);
    const closable = build('chip', { label: 'Filter', closable: true });
    expect(closable.width! - plain.width!).toBeGreaterThan(10);
    expect(build('chip', { selected: true }).children[0]).toMatchObject({ name: 'Background' });
    expect(desc('chip', { label: 'Sale', selected: true, closable: true })).toBe('Chip "Sale", selected, with close button');
  });

  it('divider is a hairline, with an optional label splitting it', () => {
    expect(names(build('divider').children)).toEqual(['Divider']);
    expect(names(build('divider', { label: 'or' }).children)).toEqual(['Divider', 'Label', 'Divider']);
    expect(desc('divider', { label: 'or' })).toBe('Divider with label "or"');
    expect(desc('divider')).toBe('Divider');
  });

  it('card height follows its content', () => {
    const base = build('card', { bodyLines: 0, title: 'T' }).height;
    expect(build('card', { bodyLines: 3, title: 'T' }).height).toBeGreaterThan(base);
    expect(build('card', { bodyLines: 0, title: 'T', image: true }, 300).height).toBeGreaterThan(base + 100);
    expect(build('card', { bodyLines: 0, title: 'T', actions: ['Open'] }).height).toBeGreaterThan(base);
    expect(texts(build('card', { actions: ['Open', 'Share'] }).children)).toEqual(expect.arrayContaining(['Card title', 'Open', 'Share']));
    expect(desc('card', { title: 'Trip', bodyLines: 2, image: true, actions: ['Book'] })).toBe('Card, image on top, title "Trip", 2 lines of body text (placeholder), actions: "Book"');
  });

  it('empty state centres its parts and adds a button when asked', () => {
    const none = build('empty-state');
    const withBtn = build('empty-state', { buttonLabel: 'Add item' });
    expect(withBtn.height).toBeGreaterThan(none.height);
    expect(names(withBtn.children)).toContain('Button');
    expect(names(none.children)).not.toContain('Button');
    expect(desc('empty-state', { icon: 'lucide:Inbox', title: 'No messages', message: 'Say hi.', buttonLabel: 'Compose' })).toBe('Empty state, icon Inbox, title "No messages", message "Say hi.", button "Compose"');
    expect(desc('empty-state')).toContain('no button');
  });

  it('search field: pill at the control height, clear button only with text', () => {
    expect(build('search-field').height).toBe(WF_SIZE.control);
    expect(names(build('search-field').children)).not.toContain('Clear');
    expect(names(build('search-field', { value: 'shoes' }).children)).toContain('Clear');
    expect(desc('search-field', { placeholder: 'Search products' })).toBe('Search field, placeholder "Search products"');
    expect(desc('search-field', { value: 'shoes', focused: true })).toBe('Search field, text "shoes", focused');
  });
});
