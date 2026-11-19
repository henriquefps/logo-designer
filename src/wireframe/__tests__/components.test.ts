import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createPath, findNode, hitTest, localBounds, solid, type ComponentNode, type DesignDocument, type GroupNode, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { clearIconCache, registerIcon } from '../icons';
import { appendPosition, detachInstance, dropPosition, insertWidth, newInstance } from '../instances';
import { getComponent, getComponents } from '../library/registry';
import { libraryFor, matchesComponent } from '../libraryIndex';
import { materializeDocument } from '../pipeline';
import { addScreen } from '../screens';

const s = () => useDocStore.getState();
const def = (kind: string) => getComponent(kind)!;

function loadWireframe(platform: 'phone' | 'desktop' = 'phone'): string {
  const doc: DesignDocument = createDocument({ name: 'W', wireframe: { screens: [] } });
  // Free content (no stack): these tests place instances by hand. Stacks: layout.test.ts.
  const id = addScreen(doc, { platform, name: 'Home', x: 0, y: 0, layout: null });
  s().load(doc);
  return id;
}

beforeEach(() => s().load(createDocument()));
afterEach(() => clearIconCache());

describe('placing instances', () => {
  it('fill components span the container minus margins; edge to edge when as wide as a phone', () => {
    expect(insertWidth(def('heading'), 390)).toEqual({ x: 24, width: 342 });
    expect(insertWidth(def('list-row'), 1440)).toEqual({ x: 0, width: 1440 });
    expect(insertWidth(def('button'), 390)).toEqual({ x: 24, width: 120 });
  });

  it('append goes below the existing content', () => {
    const screen = loadWireframe();
    expect(appendPosition(def('heading'), findNode(s().doc, screen) as GroupNode, 390)).toEqual({ x: 24, y: 24, width: 342 });
    s().addNodes([newInstance(def('heading'), { x: 24, y: 24 }, 342)], { parentId: screen });
    const frame = findNode(s().doc, screen) as GroupNode;
    expect(appendPosition(def('button'), frame, 390).y).toBe(24 + 29 + 16);
  });

  it('a drop centres non-fill components on the pointer and keeps them inside', () => {
    expect(dropPosition(def('button'), { x: 200, y: 300 }, 390)).toEqual({ x: 140, y: 278, width: 120 });
    expect(dropPosition(def('button'), { x: 5, y: 5 }, 390)).toMatchObject({ x: 0, y: 0 });
    expect(dropPosition(def('heading'), { x: 300, y: 100 }, 390)).toMatchObject({ x: 24, width: 342 });
  });
});

describe('instances in the document', () => {
  it('a new instance is built by the pipeline at its size', () => {
    const screen = loadWireframe();
    const row = newInstance(def('list-row'), { x: 0, y: 100 }, 390);
    s().addNodes([row], { parentId: screen });
    const built = findNode(s().doc, row.id) as ComponentNode;
    expect(built.component.size).toEqual({ width: 390, height: 56 });
    expect(built.children.map((c) => c.name)).toEqual(['Title', 'Trailing']);
    // The instance's box is its size (selection box, hit area, screen height).
    expect(localBounds(built)).toEqual({ x: 0, y: 0, width: 390, height: 56 });
  });

  it('clicking anywhere in the box selects the instance, never a generated child', () => {
    const screen = loadWireframe();
    const row = newInstance(def('list-row'), { x: 0, y: 100 }, 390);
    s().addNodes([row], { parentId: screen });
    // Empty space between the title and the chevron.
    expect(hitTest(s().doc, { x: 200, y: 128 })).toBe(row.id);
    expect(hitTest(s().doc, { x: 200, y: 128 }, { deep: true })).toBe(row.id);
    expect(hitTest(s().doc, { x: 30, y: 128 }, { deep: true })).toBe(row.id);
  });

  it('Detach turns the instance into a plain group in one undo step', () => {
    const screen = loadWireframe();
    const row = newInstance(def('list-row'), { x: 0, y: 100 }, 390);
    s().addNodes([row], { parentId: screen });
    const steps = s().past.length;
    const before = (findNode(s().doc, row.id) as GroupNode).children;
    s().updateNodes([row.id], (n) => void detachInstance(n), { label: 'Detach component' });
    const g = findNode(s().doc, row.id) as GroupNode;
    expect(g.component).toBeUndefined();
    expect(g.children).toEqual(before);
    expect(s().past.length).toBe(steps + 1);
    // Now its shapes are reachable one by one.
    expect(hitTest(s().doc, { x: 30, y: 128 }, { deep: true })).not.toBe(row.id);
    s().undo();
    expect((findNode(s().doc, row.id) as ComponentNode).component.kind).toBe('list-row');
  });

  it('a saved file keeps its icons on load even when the icon library is not loaded', () => {
    registerIcon('lucide:Globe', createPath({ name: 'g', subpaths: [{ closed: false, points: [{ x: -10, y: 0, type: 'corner' }, { x: 10, y: 0, type: 'corner' }] }], stroke: { paint: solid('#000'), width: 2, cap: 'round', join: 'round', dash: [] } }));
    const doc: DesignDocument = createDocument({ name: 'W', wireframe: { screens: [] } });
    const screen = addScreen(doc, { platform: 'phone', x: 0, y: 0 });
    const frame = doc.children.find((n) => n.id === screen) as ScreenNode;
    frame.children.push(newInstance(def('list-row'), { x: 0, y: 0 }, 390, { title: 'Language', leading: 'icon', leadingIcon: 'lucide:Globe' }));
    const saved = JSON.parse(JSON.stringify(materializeDocument(doc))) as DesignDocument;
    const leading = (d: DesignDocument) => ((d.children[0] as GroupNode).children[0] as GroupNode).children[0] as GroupNode;
    expect((leading(saved).children[0] as GroupNode).name).toBe('icon:lucide:Globe');
    clearIconCache();
    const reopened = materializeDocument(saved);
    expect((leading(reopened).children[0] as GroupNode).name).toBe('icon:lucide:Globe');
  });

  it('an unknown icon is drawn as a placeholder, never fails', () => {
    const screen = loadWireframe();
    const b = newInstance(def('button'), { x: 24, y: 24 }, 160, { label: 'Add', icon: 'lucide:DefinitelyNotAnIcon' });
    s().addNodes([b], { parentId: screen });
    const names = (findNode(s().doc, b.id) as GroupNode).children.map((c) => c.name);
    expect(names).toEqual(['Background', 'icon?:lucide:DefinitelyNotAnIcon', 'Label']);
  });
});

describe('library index', () => {
  it('search matches label, kind, category and keywords', () => {
    expect(matchesComponent(def('button'), 'cta')).toBe(true);
    expect(matchesComponent(def('list-row'), 'list row')).toBe(true);
    expect(matchesComponent(def('list-row'), 'table')).toBe(false);
  });

  it('the platform first, the rest under "others"', () => {
    const desktop = libraryFor(getComponents(), 'desktop');
    const mainKinds = desktop.main.flatMap((g) => g.items.map((d) => d.kind));
    expect(mainKinds).toContain('button');
    expect(mainKinds).not.toContain('list-row');
    expect(desktop.others.flatMap((g) => g.items.map((d) => d.kind))).toContain('list-row');
    expect(libraryFor(getComponents(), 'phone').others).toEqual([]);
    expect(libraryFor(getComponents(), null).others).toEqual([]);
  });
});

describe('hidden components', () => {
  it('the placeholder stand-in is not in the library but still loads and builds', () => {
    const lib = libraryFor(getComponents(), null);
    expect(lib.main.flatMap((g) => g.items.map((d) => d.kind))).not.toContain('placeholder');
    expect(libraryFor(getComponents(), null, 'placeholder').main).toEqual([]);
    const screen = loadWireframe();
    const box = newInstance(def('placeholder'), { x: 24, y: 24 }, 342, { label: 'Map', height: 200 });
    s().addNodes([box], { parentId: screen });
    expect((findNode(s().doc, box.id) as GroupNode).children.map((c) => c.name)).toEqual(['Box', 'Cross', 'Label']);
  });

  it('instances are not user-paintable, not rotatable, but resizable', async () => {
    const { canResizeNode, canRotateNode, isUserPaintable, canRotateSelection } = await import('@/model');
    const screen = loadWireframe();
    const row = newInstance(def('list-row'), { x: 0, y: 100 }, 390);
    s().addNodes([row], { parentId: screen });
    const n = findNode(s().doc, row.id)!;
    expect(isUserPaintable(n)).toBe(false);
    expect(canRotateNode(n)).toBe(false);
    expect(canResizeNode(n)).toBe(true);
    expect(canRotateSelection(s().doc, [screen])).toBe(true);
    expect(canRotateSelection(s().doc, [screen, row.id])).toBe(false);
  });
});
