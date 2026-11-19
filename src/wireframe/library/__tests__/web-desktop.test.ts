// The web and desktop components: build (sizes, children, props → shapes) and describe, plus a desktop screen
// composed from them (header over a sidebar + content hstack).
import { describe, expect, it } from 'vitest';
import { findNode, type GroupNode, type SceneNode, type ScreenNode } from '@/model';
import { getComponent } from '../registry';
import { resolveProps } from '../types';
import { HEADER_H, ROW_H } from '../data-table';
import { pageItems } from '../pagination';
import { isSidebarSection } from '../sidebar-nav';
import { desktopScreen } from './desktopScreen';

const def = (kind: string) => getComponent(kind)!;
const build = (kind: string, props: Record<string, unknown> = {}, width?: number, height?: number) => {
  const d = def(kind);
  return d.build(resolveProps(d, props), { width: width ?? d.defaultSize.width, height });
};
const describeOf = (kind: string, props: Record<string, unknown> = {}) => def(kind).describe(resolveProps(def(kind), props));
const texts = (nodes: SceneNode[]): string[] => nodes.flatMap((n) => (n.type === 'text' ? [n.text] : n.type === 'group' ? texts(n.children) : []));
const count = (nodes: SceneNode[], name: string): number => nodes.reduce((a, n) => a + (n.name === name ? 1 : 0) + (n.type === 'group' ? count(n.children, name) : 0), 0);

describe('library: web and desktop kinds', () => {
  it('are registered with the expected categories and platforms', () => {
    const expected: Record<string, string> = {
      'web-header': 'Navigation',
      'sidebar-nav': 'Navigation',
      breadcrumbs: 'Navigation',
      pagination: 'Navigation',
      toolbar: 'Navigation',
      'data-table': 'Data',
      modal: 'Overlays',
      'form-columns': 'Forms',
      footer: 'Layout',
      'cards-grid': 'Layout',
    };
    for (const [kind, category] of Object.entries(expected)) {
      expect(def(kind).category, kind).toBe(category);
      expect(def(kind).platforms, kind).toContain('desktop');
    }
  });
});

describe('web-header', () => {
  it('is 64 tall, edge to edge, with the links as text and the selected one marked', () => {
    const r = build('web-header', { selected: 2 });
    expect(r.height).toBe(64);
    expect(def('web-header').sizing.bleed).toBe(true);
    expect(texts(r.children)).toEqual(['Home', 'Products', 'Pricing', 'About']);
    expect(count(r.children, 'Selected mark')).toBe(1);
    expect(count(r.children, 'Link (selected)')).toBe(1);
  });
  it('adds search, actions and an avatar when asked, and drops links that do not fit', () => {
    const r = build('web-header', { search: true, actions: ['Sign in', 'Sign up'], avatar: true });
    expect(count(r.children, 'Search')).toBe(1);
    expect(count(r.children, 'Avatar')).toBe(1);
    expect(texts(r.children)).toEqual(expect.arrayContaining(['Sign in', 'Sign up']));
    expect(texts(build('web-header', { links: ['One', 'Two', 'Three', 'Four'] }, 360).children).length).toBeLessThan(4);
  });
  it('describes itself', () => {
    expect(describeOf('web-header')).toBe('Header with navigation: logo; links Home, Products, Pricing, About (Home selected)');
    expect(describeOf('web-header', { selected: 3, search: true, actions: ['Sign in'], avatar: true })).toBe(
      'Header with navigation: logo; links Home, Products, Pricing, About (Pricing selected); search; actions Sign in; avatar',
    );
  });
});

describe('sidebar-nav', () => {
  it('is 240 wide by default and fills a given height', () => {
    expect(def('sidebar-nav').sizing).toMatchObject({ width: 240, height: 'fill' });
    const short = build('sidebar-nav');
    expect(short.height).toBeLessThan(300);
    expect(build('sidebar-nav', {}, 240, 900).height).toBe(900);
  });
  it('treats # entries as section labels that do not count for the selection', () => {
    expect(isSidebarSection('# Workspace')).toBe(true);
    const props = { items: ['# Main', 'Dashboard', 'Projects', '# Admin', 'Users'], selected: 3 };
    const r = build('sidebar-nav', props);
    expect(count(r.children, 'Section label')).toBe(2);
    expect(count(r.children, 'Item')).toBe(2);
    expect(count(r.children, 'Item (selected)')).toBe(1);
    expect(texts(r.children)).toContain('MAIN');
    expect(describeOf('sidebar-nav', props)).toBe('Sidebar navigation; items Dashboard, Projects, Users (Users selected); section labels Main, Admin; with icons');
  });
  it('icons are optional', () => {
    expect(count(build('sidebar-nav', { icons: false }).children, 'Icon')).toBe(0);
    expect(count(build('sidebar-nav').children, 'Icon')).toBe(4);
  });
});

describe('breadcrumbs', () => {
  it('shows the levels with separators and the last one as current', () => {
    const r = build('breadcrumbs');
    expect(texts(r.children)).toEqual(['Home', 'Projects', 'Designer']);
    expect(count(r.children, 'Current')).toBe(1);
    expect(count(r.children, 'Chevron')).toBe(2);
    expect(describeOf('breadcrumbs')).toBe('Breadcrumbs: Home > Projects > Designer');
  });
});

describe('data-table', () => {
  it('has a real header row and grey bars in the body', () => {
    const r = build('data-table');
    expect(r.height).toBe(HEADER_H + 8 * ROW_H);
    expect(texts(r.children)).toEqual(['Name', 'Size', 'Modified']);
    expect(count(r.children, 'Cell')).toBe(24);
  });
  it('adds a checkbox column and row actions', () => {
    const r = build('data-table', { selectable: true, rowActions: true, rows: 3 });
    expect(count(r.children, 'Checkbox')).toBe(4);
    expect(count(r.children, 'Dot')).toBe(9);
    expect(r.height).toBe(HEADER_H + 3 * ROW_H);
  });
  it('describes itself', () => {
    expect(describeOf('data-table', { rowActions: true })).toBe('Data table: columns Name, Size, Modified; 8 rows; row actions');
    expect(describeOf('data-table', { columns: ['A'], rows: 2, selectable: true })).toBe('Data table: columns A; 2 rows; checkbox column');
  });
});

describe('modal', () => {
  it('is 480 wide with a title, body bars and two actions', () => {
    expect(def('modal').sizing.width).toBe(480);
    const r = build('modal');
    expect(texts(r.children)).toEqual(['Modal title', 'Confirm', 'Cancel']);
    expect(count(r.children, 'Bar')).toBeGreaterThanOrEqual(3);
    expect(count(r.children, 'Close')).toBe(2);
  });
  it('takes one action, or none, and grows with the body', () => {
    const one = build('modal', { secondary: '' });
    expect(texts(one.children)).toEqual(['Modal title', 'Confirm']);
    const none = build('modal', { primary: '', secondary: '' });
    expect(none.height).toBeLessThan(one.height);
    expect(build('modal', { lines: 6 }).height).toBeGreaterThan(build('modal', { lines: 2 }).height);
  });
  it('describes itself', () => {
    expect(describeOf('modal')).toBe('Modal window "Modal title"; 3 body lines; actions Confirm (primary), Cancel; close button');
    expect(describeOf('modal', { primary: '', secondary: '', close: false })).toBe('Modal window "Modal title"; 3 body lines; no actions');
  });
});

describe('form-columns', () => {
  it('lays labelled inputs out in the chosen number of columns', () => {
    const two = build('form-columns');
    expect(count(two.children, 'Input')).toBe(4);
    expect(texts(two.children)).toEqual(['First name', 'Last name', 'Email', 'Phone']);
    const one = build('form-columns', { columns: 1 });
    expect(one.height).toBeGreaterThan(two.height);
    const six = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(build('form-columns', { columns: 3, fields: six }).height).toBeLessThan(build('form-columns', { columns: 2, fields: six }).height);
  });
  it('describes itself', () => {
    expect(describeOf('form-columns')).toBe('Form in 2 columns: fields First name, Last name, Email, Phone');
    expect(describeOf('form-columns', { columns: 1, fields: ['Name'] })).toBe('Form in 1 column: fields Name');
  });
});

describe('pagination', () => {
  it('windows the pages around the current one', () => {
    expect(pageItems(5, 1)).toEqual([1, 2, '…', 5]);
    expect(pageItems(4, 2)).toEqual([1, 2, 3, 4]);
    expect(pageItems(10, 1)).toEqual([1, 2, '…', 10]);
    expect(pageItems(10, 5)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(pageItems(10, 10)).toEqual([1, '…', 9, 10]);
    expect(pageItems(1, 1)).toEqual([1]);
  });
  it('fills the current page and describes itself', () => {
    const r = build('pagination', { current: 5 });
    expect(count(r.children, 'Current page')).toBe(1);
    expect(texts(r.children)).toContain('5');
    expect(describeOf('pagination', { pages: 12, current: 4 })).toBe('Pagination: page 4 of 12');
    expect(describeOf('pagination', { pages: 3, current: 9 })).toBe('Pagination: page 3 of 3');
  });
});

describe('toolbar', () => {
  it('lists the actions and a search field on the right', () => {
    const r = build('toolbar');
    expect(r.height).toBe(56);
    expect(def('toolbar').sizing.bleed).toBe(true);
    expect(texts(r.children)).toEqual(expect.arrayContaining(['New', 'Upload', 'Filter', 'Sort', 'Search']));
    expect(count(r.children, 'Search')).toBe(1);
    expect(texts(build('toolbar', { search: false }).children)).not.toContain('Search');
  });
  it('can show icons and a title', () => {
    expect(count(build('toolbar', { icons: true }).children, 'Icon')).toBe(4);
    expect(texts(build('toolbar', { title: 'Files' }).children)).toContain('Files');
  });
  it('describes itself', () => {
    expect(describeOf('toolbar')).toBe('Toolbar; actions New, Upload, Filter, Sort; search on the right');
    expect(describeOf('toolbar', { title: 'Files', actions: [], search: false })).toBe('Toolbar; title "Files"; no actions');
  });
});

describe('footer', () => {
  it('has a column of link bars per heading, a logo and a legal row', () => {
    const r = build('footer');
    expect(texts(r.children)).toEqual(['Product', 'Company', 'Support']);
    expect(count(r.children, 'Column')).toBe(3);
    expect(count(r.children, 'Link')).toBe(12);
    expect(count(r.children, 'Logo')).toBe(1);
    expect(count(r.children, 'Legal')).toBe(1);
    expect(def('footer').sizing.bleed).toBe(true);
  });
  it('drops the logo and legal row', () => {
    const r = build('footer', { logo: false, legal: false });
    expect(count(r.children, 'Logo')).toBe(0);
    expect(r.height).toBeLessThan(build('footer').height);
  });
  it('describes itself', () => {
    expect(describeOf('footer')).toBe('Footer: columns Product, Company, Support; 4 links each; logo; legal row');
  });
});

describe('cards-grid', () => {
  it('draws columns × rows cards, image on top by default', () => {
    const r = build('cards-grid');
    expect(count(r.children, 'Card')).toBe(6);
    expect(count(r.children, 'Card image')).toBe(6);
  });
  it('styles: text only has no images, horizontal is shorter than image-on-top', () => {
    expect(count(build('cards-grid', { cardStyle: 'text' }).children, 'Card image')).toBe(0);
    expect(build('cards-grid', { cardStyle: 'horizontal' }).height).toBeLessThan(build('cards-grid').height);
  });
  it('grows with the rows', () => {
    expect(build('cards-grid', { rows: 4 }).height).toBeGreaterThan(build('cards-grid', { rows: 2 }).height);
  });
  it('describes itself', () => {
    expect(describeOf('cards-grid')).toBe('Cards grid: 3 columns × 2 rows (6 cards), image on top');
  });
});

describe('a desktop screen from the components', () => {
  const doc = desktopScreen();
  const at = (id: string) => findNode(doc, id) as GroupNode;
  const sizeOf = (id: string) => (at(id).component?.size ?? at(id).layout?.size)!;

  it('header spans the screen, the body sits below it', () => {
    expect(sizeOf('header')).toMatchObject({ width: 1440, height: 64 });
    expect(at('body').transform.y).toBe(64);
    expect(sizeOf('body').width).toBe(1440);
  });
  it('the sidebar is 240 wide and as tall as the body; the content takes the rest', () => {
    expect(sizeOf('sidebar').width).toBe(240);
    expect(sizeOf('sidebar').height).toBe(sizeOf('body').height);
    expect(at('content').transform.x).toBe(240);
    expect(sizeOf('content').width).toBe(1200);
  });
  it('the toolbar bleeds across the content padding, the table sits inside it', () => {
    expect(sizeOf('toolbar').width).toBe(1200);
    expect(at('toolbar').transform.x).toBe(0);
    expect(sizeOf('table').width).toBe(1200 - 48);
    expect(at('table').transform.x).toBe(24);
  });
  it('the screen is at least the desktop minimum and grows with the content', () => {
    const h = (findNode(doc, 'F') as ScreenNode).screen.height;
    expect(h).toBeGreaterThanOrEqual(900);
    expect(h).toBeGreaterThanOrEqual(64 + 24 + 32 + 56 + HEADER_H + 8 * ROW_H);
  });
});
