// Selected item follows the screen, through the screens that open it (docs/wireframe-mode.md → Selected item follows
// the screen): with no item linking to the current screen, the item linking to the nearest screen that (directly or
// through others) opens it; nearest wins (BFS over incoming flows), ties go to the first item, cycles are safe, and
// with no path the first item. Same value in canvas, export for AI and Present mode (all read `component.resolved`).
import { beforeEach, describe, expect, it } from 'vitest';
import { current, produce } from 'immer';
import { createDocument, findNode, type ComponentNode, type DesignDocument, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { aiMarkdown } from '../aiExport';
import { addFlow } from '../flows';
import { materializeDocument } from '../pipeline';
import { addScreen } from '../screens';
import { newSymbolInstance, symbolsOf } from '../symbols';
import { distancesTo, screenGraph } from '../steps/autoSelect';
import { inst, navProject } from '../spec/__tests__/fixtures';

const s = () => useDocStore.getState();
const TABS = ['Home', 'Search', 'Settings'];
const resolved = (doc: DesignDocument, id: string) => (findNode(doc, id) as ComponentNode).component.resolved;
const sid = (doc: DesignDocument, name: string) => doc.wireframe!.screens.find((x) => x.name === name)!.id;

/**
 * Screens Home, Search, Settings (each with its own bottom navigation linking the three), Server, Details, Loop A,
 * Loop B (a bottom navigation each, no item linking to them) and buttons whose flows `links` lists as
 * [button's screen, target screen].
 */
function project(links: [string, string][]): DesignDocument {
  const doc = createDocument({ name: 'Nav', wireframe: { screens: [] } });
  const names = [...TABS, 'Server', 'Details', 'Loop A', 'Loop B'];
  names.forEach((name, i) => {
    const fid = addScreen(doc, { platform: 'phone', name, x: 500 * i, y: 0 });
    const f = doc.children.find((n) => n.id === fid) as ScreenNode;
    f.children = [inst(`nav-${name}`, 'bottom-navigation', { labels: [...TABS], selected: 'auto' })];
    links.forEach(([on, to], k) => on === name && f.children.unshift(inst(`btn-${k}`, 'button', { label: `Open ${to}` })));
  });
  for (const name of names) TABS.forEach((tab, i) => addFlow(doc, `nav-${name}`, sid(doc, tab), undefined, { part: `item:${i}` }));
  links.forEach(([, to], k) => addFlow(doc, `btn-${k}`, sid(doc, to)));
  return materializeDocument(doc);
}

beforeEach(() => s().load(createDocument()));

describe('distancesTo', () => {
  it('walks incoming flows breadth first, safe with cycles', () => {
    const graph = new Map([
      ['C', new Set(['B'])],
      ['B', new Set(['A', 'C'])],
      ['A', new Set(['B'])],
    ]);
    expect([...distancesTo(graph, 'C')]).toEqual([
      ['C', 0],
      ['B', 1],
      ['A', 2],
    ]);
    expect([...distancesTo(new Map(), 'X')]).toEqual([['X', 0]]);
  });

  it('the screen graph counts the screen each flow starts on', () => {
    const doc = project([['Settings', 'Server']]);
    const g = screenGraph(doc);
    expect([...g.get(sid(doc, 'Server'))!]).toEqual([sid(doc, 'Settings')]);
    expect(g.get(sid(doc, 'Settings'))!.size).toBe(7); // every navigation links Settings
  });
});

describe('selected: auto through the screens that open the current one', () => {
  it('direct: the item linking to the current screen', () => {
    expect(resolved(project([]), 'nav-Settings')).toEqual({ selected: 3 });
    expect(resolved(project([]), 'nav-Search')).toEqual({ selected: 2 });
  });

  it('one level: Settings → Server keeps Settings selected on Server', () => {
    expect(resolved(project([['Settings', 'Server']]), 'nav-Server')).toEqual({ selected: 3 });
  });

  it('two levels: Settings → Server → Details', () => {
    const doc = project([
      ['Settings', 'Server'],
      ['Server', 'Details'],
    ]);
    expect(resolved(doc, 'nav-Details')).toEqual({ selected: 3 });
  });

  it('the nearest screen wins over a farther one, even when its item comes later', () => {
    const doc = project([
      ['Home', 'Server'],
      ['Server', 'Details'],
      ['Settings', 'Details'],
    ]);
    expect(resolved(doc, 'nav-Details')).toEqual({ selected: 3 }); // Settings opens Details directly; Home in 2
  });

  it('ties: the first such item', () => {
    const doc = project([
      ['Settings', 'Server'],
      ['Search', 'Server'],
    ]);
    expect(resolved(doc, 'nav-Server')).toEqual({ selected: 2 });
  });

  it('cycles: safe, and still resolved through the way in', () => {
    const doc = project([
      ['Loop A', 'Loop B'],
      ['Loop B', 'Loop A'],
      ['Settings', 'Loop A'],
    ]);
    expect(resolved(doc, 'nav-Loop B')).toEqual({ selected: 3 });
    const closed = project([
      ['Loop A', 'Loop B'],
      ['Loop B', 'Loop A'],
    ]);
    expect(resolved(closed, 'nav-Loop B')).toBeUndefined(); // no path from any item: the first item
  });

  it('no path: the first item (nothing stored)', () => {
    expect(resolved(project([]), 'nav-Server')).toBeUndefined();
    // A screen the current one opens is not a way in.
    expect(resolved(project([['Server', 'Settings']]), 'nav-Server')).toBeUndefined();
  });

  it('follows edits in the app: a button moved to another screen (same flows) changes the selection, undoably', () => {
    s().load(project([['Settings', 'Server']]));
    expect(resolved(s().doc, 'nav-Server')).toEqual({ selected: 3 });
    const home = s().doc.children.find((n) => n.name === 'Home')!.id;
    s().moveNodes(['btn-0'], home, 0);
    expect(resolved(s().doc, 'nav-Server')).toEqual({ selected: 1 });
    s().undo();
    expect(resolved(s().doc, 'nav-Server')).toEqual({ selected: 3 });
  });

  it('the export for AI marks the same item', () => {
    const md = aiMarkdown(project([['Settings', 'Server']]));
    expect(md.screens.find((x) => x.name === 'Server')!.markdown).toMatch(/Bottom navigation: Home → opens Home; Search → opens Search; Settings \(selected\) → opens Settings/);
  });

  it('a shared navigation: each instance resolves on its own screen', () => {
    // navProject: a shared tab bar (Gallery, Files, Albums, Settings) on four screens. Add Server, opened from a
    // button on Settings, with the tab bar too.
    let doc = produce(navProject(), (d) => {
      const fid = addScreen(d, { platform: 'phone', name: 'Server', x: 2500, y: 0 });
      const f = d.children.find((n) => n.id === fid) as ScreenNode;
      const symbols = symbolsOf(current(d));
      f.children.push({ ...newSymbolInstance(symbols[0], symbols, { x: 0, y: 0 }), id: 'tabbar-V', layoutItem: { position: 'pinned-bottom' } } as never);
      (d.children.find((n) => n.id === 'S') as ScreenNode).children.unshift(inst('to-server', 'button', { label: 'Server' }));
    });
    doc = materializeDocument(doc);
    doc = materializeDocument(produce(doc, (d) => void addFlow(d, 'to-server', sid(doc, 'Server'))));
    expect(resolved(doc, 'tabbar-V~s~nav')).toEqual({ selected: 4 });
    expect(resolved(doc, 'tabbar-S~s~nav')).toEqual({ selected: 4 });
    expect(resolved(doc, 'tabbar-F~s~nav')).toEqual({ selected: 2 });
  });
});
