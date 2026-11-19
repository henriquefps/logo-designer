import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createDocument, createGroup, createRect, createText, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type LayoutItemInfo, type SceneNode, type ScreenNode } from '@/model';
import { aiMarkdown, aiMarkdownCombined, aiScreens, aiZip } from '../aiExport';
import { materializeDocument } from '../pipeline';
import { addNote } from '../notes';
import { addScreen, duplicateScreenAs } from '../screens';

const comp = (id: string, kind: string, props: Record<string, unknown>, item?: LayoutItemInfo): ComponentNode => ({
  ...createGroup({ name: id }),
  id,
  component: { kind, props },
  ...(item ? { layoutItem: item } : {}),
});
const stack = (id: string, layout: Partial<LayoutInfo> & Pick<LayoutInfo, 'kind'>, children: SceneNode[], item?: LayoutItemInfo): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 8, padding: 0, align: 'stretch', ...layout },
  children,
  ...(item ? { layoutItem: item } : {}),
});

/** Two logical screens: Home (phone + desktop; nested stacks, pinned bottom nav, free FAB) and Settings Page (phone). */
function fixture(): DesignDocument {
  const doc = createDocument({ name: 'Notes App', wireframe: { screens: [] } });
  const home = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0 });
  const frame = doc.children.find((n) => n.id === home) as ScreenNode;
  frame.children = [
    comp('title', 'heading', { text: 'My notes', level: 'title' }),
    stack('row1', { kind: 'hstack' }, [comp('b1', 'button', { label: 'Sort' }), comp('b2', 'button', { label: 'Filter' })]),
    stack('lone', { kind: 'vstack' }, [comp('r0', 'list-row', { title: 'Wrapped', trailing: 'none' })]),
    stack('rows', { kind: 'vstack' }, [comp('r1', 'list-row', { title: 'Shopping', subtitle: '3 items' }), comp('r2', 'list-row', { title: 'Ideas', trailing: 'toggle' })]),
    stack('grid', { kind: 'grid', columns: 3 }, [comp('g1', 'button', { label: 'A' }), comp('g2', 'button', { label: 'B' })]),
    createText({ id: 'hello', text: 'Hello' }),
    createRect({ id: 'box', width: 40, height: 40 }),
    comp('nav', 'list-row', { title: 'Bottom nav' }, { position: 'pinned-bottom' }),
    { ...comp('fab', 'button', { label: '+' }, { position: 'free' }), transform: { x: 300, y: 760, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0 } as never },
  ];
  duplicateScreenAs(doc, home, 'desktop');
  addScreen(doc, { platform: 'phone', name: 'Settings Page' });
  const settings = doc.children.filter((n): n is ScreenNode => !!(n as ScreenNode).screen).at(-1)!;
  settings.children = [comp('sh', 'heading', { text: 'Settings' })];
  const out = structuredClone(materializeDocument(doc));
  addNote(out, { target: 'r1', text: 'Swipe left to delete' });
  addNote(out, { target: 'fab', text: 'Creates a new note' });
  addNote(out, { target: home, text: 'Home is the start screen' });
  addNote(out, { text: 'Offline first.\nSync later.' });
  return out;
}

describe('export for AI: markdown', () => {
  const md = aiMarkdown(fixture());
  const home = md.screens[0].markdown;

  it('lists screens with their platforms and the free notes in the README', () => {
    expect(md.readme).toContain('# Notes App');
    expect(md.readme).toContain('- Home — phone 390×844, desktop 1440×900 — `screens/home.md`');
    expect(md.readme).toContain('- Settings Page — phone 390×844 — `screens/settings-page.md`');
    expect(md.readme).toMatch(/## Notes\n\n- Offline first\. Sync later\./);
    expect(md.readme).not.toContain('Swipe left');
  });

  it('describes components, containers and positions', () => {
    expect(home).toContain('## Phone (390×844)');
    expect(home).toContain('## Desktop (1440×900)');
    expect(home).toContain('- Title "My notes"');
    expect(home).toContain('- Horizontal stack\n  - Primary button "Sort"');
    expect(home).toContain('- Grid (3 columns)');
    expect(home).toContain('- Vertical stack\n  - List row "Shopping"');
    expect(home).toContain('Text "Hello"');
    expect(home).toContain('Shape (rectangle)');
    expect(home).toMatch(/List row "Bottom nav".* — pinned to bottom/);
    expect(home).toMatch(/button "\+" — floating, bottom right/);
  });

  it('collapses a stack that holds one child', () => {
    expect(home).toContain('- List row "Wrapped"');
    expect(home).not.toMatch(/Vertical stack\n {2}- List row "Wrapped"/);
  });

  it('puts notes next to the element they are attached to', () => {
    expect(home).toMatch(/List row "Shopping".*\n {4}- Note: Swipe left to delete/);
    expect(home).toMatch(/button "\+".*\n {2}- Note: Creates a new note/);
    expect(home).toContain('Note on the whole screen: Home is the start screen');
  });

  it('is stable and readable (snapshot)', () => {
    expect(md.readme).toMatchSnapshot();
    expect(home).toMatchSnapshot();
    expect(md.screens[1].markdown).toMatchSnapshot();
  });

  it('combines everything for the clipboard', () => {
    const all = aiMarkdownCombined(fixture());
    expect(all).toContain('# Notes App');
    expect(all).toContain('# Home');
    expect(all).toContain('# Settings Page');
    expect(all).not.toContain('.png\n\n![');
  });

  it('refuses documents that are not wireframes', () => {
    expect(() => aiMarkdown(createDocument())).toThrow(/wireframe/);
  });
});

describe('export for AI: slugs and zip', () => {
  it('slugs are unique and stable', () => {
    const doc = fixture();
    doc.wireframe!.screens.push({ id: 'dup', name: 'home' }, { id: 'dup2', name: 'Home!' });
    expect(aiScreens(doc).map((s) => s.slug)).toEqual(['home', 'settings-page', 'home-2', 'home-3']);
    expect(aiScreens(fixture()).map((s) => s.slug)).toEqual(['home', 'settings-page']);
  });

  it('writes the package', async () => {
    const calls: string[] = [];
    const zip = await aiZip(fixture(), async (f) => {
      calls.push(`${f.name}.${f.screen.platform}`);
      return new Uint8Array([137, 80, 78, 71]);
    });
    const files = Object.keys((await JSZip.loadAsync(zip)).files).filter((p) => !p.endsWith('/')).sort();
    expect(files).toEqual([
      'notes-app/README.md',
      'notes-app/project.designer.json',
      'notes-app/screens/home.desktop.png',
      'notes-app/screens/home.md',
      'notes-app/screens/home.phone.png',
      'notes-app/screens/settings-page.md',
      'notes-app/screens/settings-page.phone.png',
    ]);
    expect(calls).toHaveLength(3);
    const project = JSON.parse(await (await JSZip.loadAsync(zip)).file('notes-app/project.designer.json')!.async('string'));
    expect(project.wireframe.screens).toHaveLength(2);
  });
});
