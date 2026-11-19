import { beforeEach, describe, expect, it } from 'vitest';
import { boundsIn, createDocument, findNode, fromTransform, type ComponentNode, type DesignDocument, type GroupNode, type SceneNode, type TextNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { defaultPlacement, newInstance } from '../../instances';
import { addScreen } from '../../screens';
import { getComponent } from '../registry';
import { defaultProps, resolveProps } from '../types';

const def = (kind: string) => getComponent(kind)!;
const build = (kind: string, props: Record<string, unknown> = {}, width = def(kind).defaultSize.width) => def(kind).build(resolveProps(def(kind), props), { width });
const describeOf = (kind: string, props: Record<string, unknown> = {}) => def(kind).describe(resolveProps(def(kind), props));
const names = (n: SceneNode[]) => n.map((c) => c.name);
const texts = (nodes: SceneNode[]): string[] => nodes.flatMap((n) => (n.type === 'text' ? [n.text] : n.type === 'group' ? texts(n.children) : []));
const find = (nodes: SceneNode[], name: string) => nodes.find((n) => n.name === name);
const bounds = (n: SceneNode) => boundsIn(n, fromTransform(n.transform))!;

describe('phone and tablet library', () => {
  it('lists all components for phone and tablet, in the agreed categories', () => {
    const want: Record<string, string> = {
      'top-app-bar': 'Navigation',
      'bottom-navigation': 'Navigation',
      tabs: 'Navigation',
      'section-header': 'Lists',
      fab: 'Actions',
      'bottom-sheet': 'Overlays',
      dialog: 'Overlays',
      snackbar: 'Overlays',
      'image-grid': 'Media',
      'segmented-control': 'Actions',
    };
    for (const [kind, category] of Object.entries(want)) {
      expect(def(kind), kind).toBeDefined();
      expect(def(kind).category).toBe(category);
      expect(def(kind).platforms).toEqual(['phone', 'tablet']);
    }
  });

  it('edge-to-edge pieces bleed; contained ones do not', () => {
    for (const k of ['top-app-bar', 'bottom-navigation', 'tabs', 'section-header', 'bottom-sheet']) expect(def(k).sizing.bleed, k).toBe(true);
    for (const k of ['fab', 'dialog', 'snackbar', 'image-grid', 'segmented-control']) expect(def(k).sizing.bleed, k).toBeFalsy();
  });
});

describe('top app bar', () => {
  it('is 56 tall, 108 with a large title, and has a divider at the bottom', () => {
    expect(build('top-app-bar').height).toBe(56);
    expect(build('top-app-bar', { large: true }).height).toBe(108);
    expect(names(build('top-app-bar').children)).toContain('Divider');
  });
  it('leading none / back / menu / close', () => {
    expect(names(build('top-app-bar', { leading: 'none' }).children)).not.toContain('Back');
    for (const [l, n] of [['back', 'Back'], ['menu', 'Menu'], ['close', 'Close']]) expect(names(build('top-app-bar', { leading: l }).children)).toContain(n);
    const t = (leading: string) => (find(build('top-app-bar', { leading }).children, 'Title') as TextNode).transform.x;
    expect(t('back')).toBeGreaterThan(t('none'));
  });
  it('draws as many actions as asked (0–3), on the right, and the title stops before them', () => {
    expect(find(build('top-app-bar', { actions: 0 }).children, 'Actions')).toBeUndefined();
    const acts = (n: number) => (find(build('top-app-bar', { actions: n }).children, 'Actions') as GroupNode).children.length;
    expect([1, 2, 3].map(acts)).toEqual([1, 2, 3]);
    const r = build('top-app-bar', { title: 'A really long title that cannot fit between the icons', actions: 3 });
    const title = bounds(find(r.children, 'Title')!);
    expect(title.x + title.width).toBeLessThanOrEqual(bounds(find(r.children, 'Actions')!).x);
  });
  it('a large title is its own line below the bar', () => {
    const r = build('top-app-bar', { large: true, title: 'Library' });
    expect((find(r.children, 'Title') as TextNode).fontSize).toBe(28);
    expect(bounds(find(r.children, 'Title')!).y).toBeGreaterThanOrEqual(56);
  });
  it('describes itself', () => {
    expect(describeOf('top-app-bar', { title: 'Settings', actions: 2 })).toBe('Top app bar "Settings", leading back button, actions: Search, Share2');
    expect(describeOf('top-app-bar', { title: 'Library', leading: 'menu', actions: 0, large: true })).toBe('Top app bar "Library", large title, leading menu button');
  });
});

describe('bottom navigation', () => {
  it('has a tab per label, the selected one marked, and is pinned to the bottom by default', () => {
    const r = build('bottom-navigation');
    expect(r.height).toBe(64);
    expect(names(r.children).filter((n) => n.startsWith('Tab'))).toHaveLength(3);
    const tab = (i: number) => find(r.children, `Tab ${i}`) as GroupNode;
    expect(names(tab(1).children)).toContain('Selected');
    expect(names(tab(2).children)).not.toContain('Selected');
    expect(texts(r.children)).toEqual(['Gallery', 'Albums', 'Settings']);
    expect(def('bottom-navigation').placement).toEqual({ position: 'pinned-bottom' });
  });
  it('the selection follows the index and is clamped', () => {
    const sel = (selected: number) => names((build('bottom-navigation', { selected }).children.find((c) => names((c as GroupNode).children ?? []).includes('Selected')) as GroupNode).children);
    expect(sel(2)).toContain('Selected');
    const r = build('bottom-navigation', { selected: 5 }); // only 3 tabs: the last
    expect(names((find(r.children, 'Tab 3') as GroupNode).children)).toContain('Selected');
  });
  it('describes itself', () => {
    expect(describeOf('bottom-navigation')).toBe('Bottom navigation: Gallery (selected), Albums, Settings');
    expect(describeOf('bottom-navigation', { labels: ['Home', 'Search'], selected: 2 })).toBe('Bottom navigation: Home, Search (selected)');
  });
});

describe('tabs', () => {
  it('underlines the selected tab, equal widths', () => {
    const r = build('tabs', { selected: 2 }, 300);
    expect(r.height).toBe(48);
    expect(names((find(r.children, 'Tab 2') as GroupNode).children)).toContain('Indicator');
    expect(names((find(r.children, 'Tab 1') as GroupNode).children)).not.toContain('Indicator');
    expect(bounds((find(r.children, 'Tab 2') as GroupNode).children[1]).width).toBe(100);
  });
  it('describes itself', () => {
    expect(describeOf('tabs')).toBe('Tabs: Photos (selected), Albums, Shared');
    expect(describeOf('tabs', { selected: 3 })).toBe('Tabs: Photos, Albums, Shared (selected)');
  });
});

describe('section header', () => {
  it('label on the left, optional action on the right', () => {
    expect(texts(build('section-header', { label: 'Recent' }).children)).toEqual(['Recent']);
    const r = build('section-header', { label: 'Recent', action: 'See all' });
    expect(texts(r.children)).toEqual(['Recent', 'See all']);
    expect(bounds(find(r.children, 'Label')!).x + bounds(find(r.children, 'Label')!).width).toBeLessThanOrEqual(bounds(find(r.children, 'Action')!).x);
  });
  it('describes itself', () => {
    expect(describeOf('section-header', { label: 'Recent', action: 'See all' })).toBe('Section header "Recent", action "See all"');
    expect(describeOf('section-header', { label: 'Recent' })).toBe('Section header "Recent"');
  });
});

describe('FAB', () => {
  it('is a 56 circle without a label and a wider pill with one', () => {
    const round = build('fab');
    expect(round).toMatchObject({ height: 56, width: 56 });
    expect(names(round.children)).not.toContain('Label');
    const ext = build('fab', { label: 'New album' });
    expect(ext.width).toBeGreaterThan(56);
    // Built at the width it asks for, the label fits; at 56 it is cut (the instance keeps its width until resized).
    const wide = build('fab', { label: 'New album' }, ext.width);
    expect(names(wide.children)).toContain('Label');
    expect((find(wide.children, 'Label') as TextNode).text).toBe('New album');
  });
  it('is free near the bottom right by default', () => {
    expect(def('fab').placement).toEqual({ position: 'free', anchor: 'bottom-right' });
  });
  it('describes itself', () => {
    expect(describeOf('fab')).toBe('FAB with icon Plus');
    expect(describeOf('fab', { label: 'New album', icon: '' })).toBe('Extended FAB "New album"');
  });
});

describe('bottom sheet', () => {
  it('title, handle and a row per label, growing with the rows', () => {
    const three = build('bottom-sheet');
    expect(names(three.children)).toEqual(['Sheet', 'Handle', 'Title', 'Rows']);
    expect(texts(three.children)).toEqual(['Title', 'Copy link', 'Send as message', 'More options']);
    expect(build('bottom-sheet', { rows: ['A'] }).height).toBeLessThan(three.height);
    expect(build('bottom-sheet', { title: '' }).height).toBeLessThan(three.height);
    expect(names(build('bottom-sheet', { title: '' }).children)).not.toContain('Title');
  });
  it('describes itself', () => {
    expect(describeOf('bottom-sheet', { title: 'Share', rows: ['Copy link', 'Message'] })).toBe('Bottom sheet "Share": Copy link, Message');
  });
});

describe('dialog', () => {
  it('wraps the message inside the card and puts the main action rightmost', () => {
    const r = build('dialog', { message: 'A long message that has to wrap onto several lines to fit in the dialog.' });
    const msg = find(r.children, 'Message') as TextNode;
    expect(msg.text.split('\n').length).toBeGreaterThan(1);
    const main = bounds(find(r.children, 'Main action')!);
    const other = bounds(find(r.children, 'Other action')!);
    expect(main.x).toBeGreaterThan(other.x + other.width - 1);
    expect(main.y + main.height).toBeLessThanOrEqual(r.height);
  });
  it('one action when the other is empty', () => {
    const r = build('dialog', { secondary: '' });
    expect(names(r.children)).toContain('Main action');
    expect(names(r.children)).not.toContain('Other action');
  });
  it('grows with the message', () => {
    expect(build('dialog', { message: 'Short.' }).height).toBeLessThan(build('dialog', { message: 'Word '.repeat(60) }).height);
  });
  it('describes itself', () => {
    expect(describeOf('dialog')).toBe('Dialog "Delete photo?", message "This photo will be removed from all your albums.", actions: "Delete" (main), "Cancel"');
    expect(describeOf('dialog', { title: '', message: '', primary: 'OK', secondary: '' })).toBe('Dialog, actions: "OK" (main)');
  });
});

describe('snackbar', () => {
  it('dark bar with a message and an optional action', () => {
    expect(texts(build('snackbar').children)).toEqual(['Photo deleted', 'Undo']);
    expect(texts(build('snackbar', { action: '' }).children)).toEqual(['Photo deleted']);
    expect(build('snackbar').height).toBe(48);
  });
  it('describes itself', () => {
    expect(describeOf('snackbar')).toBe('Snackbar "Photo deleted", action "Undo"');
    expect(describeOf('snackbar', { message: 'Saved', action: '' })).toBe('Snackbar "Saved"');
  });
});

describe('image grid', () => {
  const cells = (r: ReturnType<typeof build>) => (r.children[0] as GroupNode).children;
  it('columns × rows square cells filling the width', () => {
    const r = build('image-grid', { columns: 3, rows: 2, gap: 4 }, 308);
    expect(cells(r)).toHaveLength(6);
    const first = bounds(cells(r)[0]);
    expect(first.width).toBe(100);
    expect(first.height).toBe(100);
    expect(r.height).toBe(204);
    const last = bounds(cells(r)[5]);
    expect(last.x + last.width).toBeCloseTo(308);
  });
  it('a fixed height shares the rows', () => {
    const r = def('image-grid').build(resolveProps(def('image-grid'), { columns: 2, rows: 2, gap: 0 }), { width: 200, height: 300 });
    expect(r.height).toBe(300);
    expect(bounds(cells(r)[0]).height).toBe(150);
  });
  it('describes itself', () => {
    expect(describeOf('image-grid')).toBe('Image grid, 3 columns × 2 rows (6 images), gap 4px');
  });
});

describe('segmented control', () => {
  it('fills the selected segment', () => {
    const r = build('segmented-control', { selected: 2 }, 300);
    expect(r.height).toBe(32);
    expect(names((find(r.children, 'Segment 2') as GroupNode).children)).toContain('Selected');
    expect(names((find(r.children, 'Segment 1') as GroupNode).children)).not.toContain('Selected');
  });
  it('describes itself', () => {
    expect(describeOf('segmented-control')).toBe('Segmented control: Day (selected), Week, Month');
  });
});

describe('default placement on a screen', () => {
  const frame = { width: 390, height: 844, layout: true };
  const place = (kind: string, f = frame) => defaultPlacement(def(kind), defaultProps(def(kind)), f)!;

  it('components without a placement join the flow', () => {
    expect(defaultPlacement(def('list-row'), defaultProps(def('list-row')), frame)).toBeNull();
    expect(defaultPlacement(def('tabs'), defaultProps(def('tabs')), frame)).toBeNull();
  });
  it('bottom navigation is pinned to the bottom', () => {
    expect(place('bottom-navigation')).toEqual({ at: { x: 0, y: 0 }, width: 390, layoutItem: { position: 'pinned-bottom' } });
    // A screen without a stack keeps free content: just put it at the bottom.
    expect(place('bottom-navigation', { ...frame, layout: false })).toEqual({ at: { x: 0, y: 780 }, width: 390 });
  });
  it('the FAB is free at the bottom right, the snackbar at the bottom, the sheet on the edge, the dialog centred', () => {
    const fab = place('fab');
    expect(fab).toMatchObject({ width: 56, layoutItem: { position: 'free' }, at: { x: 390 - 16 - 56, y: 844 - 24 - 56 } });
    const snack = place('snackbar');
    expect(snack).toMatchObject({ width: 358, at: { x: 16, y: 844 - 24 - 48 } });
    const sheet = place('bottom-sheet');
    expect(sheet.width).toBe(390);
    expect(sheet.at.x).toBe(0);
    expect(sheet.at.y + def('bottom-sheet').build(defaultProps(def('bottom-sheet')), { width: 390 }).height).toBe(844);
    const dlg = place('dialog');
    expect(dlg.width).toBe(320);
    expect(dlg.at.x).toBe(35);
    const h = def('dialog').build(defaultProps(def('dialog')), { width: 320 }).height;
    expect(dlg.at.y).toBeCloseTo((844 - h) / 2);
    expect(dlg.layoutItem).toEqual({ position: 'free' });
  });
  it('free pieces near the bottom sit above bars pinned there', () => {
    const f = { ...frame, inset: 64 };
    expect(place('fab', f).at.y).toBe(844 - 64 - 24 - 56);
    expect(place('snackbar', f).at.y).toBe(844 - 64 - 24 - 48);
    expect(place('bottom-sheet', f).at.y + def('bottom-sheet').build(defaultProps(def('bottom-sheet')), { width: 390 }).height).toBe(844);
  });
  it('a narrow screen shrinks the dialog', () => {
    expect(place('dialog', { width: 300, height: 600, layout: true }).width).toBe(252);
  });

  describe('in the document', () => {
    beforeEach(() => useDocStore.getState().load(createDocument()));
    it('a pinned bottom navigation sits at the bottom of the screen, a free FAB where it was put', () => {
      const doc: DesignDocument = createDocument({ name: 'W', wireframe: { screens: [] } });
      const screen = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0 });
      useDocStore.getState().load(doc);
      const d = (k: string) => {
        const p = place(k);
        const n = newInstance(def(k), p.at, p.width);
        if (p.layoutItem) n.layoutItem = p.layoutItem;
        return n;
      };
      const nav = d('bottom-navigation');
      const fab = d('fab');
      useDocStore.getState().addNodes([nav, fab], { parentId: screen });
      const s = useDocStore.getState().doc;
      const navNode = findNode(s, nav.id) as ComponentNode;
      expect(navNode.layoutItem).toEqual({ position: 'pinned-bottom' });
      expect(navNode.transform).toMatchObject({ x: 0, y: 844 - 64 });
      expect(navNode.component.size).toEqual({ width: 390, height: 64 });
      const fabNode = findNode(s, fab.id) as ComponentNode;
      expect(fabNode.transform).toMatchObject({ x: 390 - 16 - 56, y: 844 - 24 - 56 });
      expect(fabNode.component.size).toEqual({ width: 56, height: 56 });
    });
  });
});
