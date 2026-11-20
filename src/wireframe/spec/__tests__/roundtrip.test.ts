// A1 (decided): `build(dump(p)) == p` for projects made of library pieces, and `build --into` updates by id,
// keeping the geometry the spec leaves out and removing only what the spec removed.
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { findNode, type ComponentNode, type DesignDocument, type GroupNode, type SceneNode, type ScreenNode } from '@/model';
import { validateDocument } from '@/io/projectFile';
import { masterShape } from '../../symbols';
import { materializeDocument } from '../../pipeline';
import { buildFromSpec, dumpToSpec } from '..';
import { containersProject, settingsProject, sharedProject, variantsProject } from './fixtures';

/** The project as the spec sees it: top-level order (z-order) aside, masters compared by what instances share. */
function canonical(doc: DesignDocument) {
  return {
    name: doc.name,
    children: [...doc.children].sort((a, b) => a.id.localeCompare(b.id)),
    screens: doc.wireframe!.screens,
    flows: doc.wireframe!.flows ?? [],
    symbols: (doc.wireframe!.symbols ?? []).map((s) => ({ id: s.id, name: s.name, shape: masterShape(s), layoutItem: s.content.layoutItem })),
  };
}

/** The dump goes through JSON like a file does. */
const viaJson = (doc: DesignDocument) => JSON.parse(JSON.stringify(dumpToSpec(doc)));

const FIXTURES: [string, () => DesignDocument][] = [
  ['settings (rows, toggles, radio group, button, pinned nav, flow, notes, status)', settingsProject],
  ['containers (vstack / hstack / grid, styles, repeat, nested, fixed, free, pinned, free frame, plain shapes)', containersProject],
  ['shared components (two screens, nested, inside a repeat, flows from inside an instance)', sharedProject],
  ['multi-variant screens (phone + tablet, desktop)', variantsProject],
];

describe('wireframe spec round trip', () => {
  it.each(FIXTURES)('build(dump(p)) equals p: %s', (_name, make) => {
    const p = make();
    const spec = viaJson(p);
    const { doc, warnings } = buildFromSpec(spec);
    expect(warnings).toEqual([]);
    expect(canonical(doc)).toEqual(canonical(p));
    // The result is a valid project file.
    expect(() => validateDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it.each(FIXTURES)('dump is stable: dump(build(dump(p))) equals dump(p): %s', (_name, make) => {
    const p = make();
    const spec = viaJson(p);
    expect(viaJson(buildFromSpec(spec).doc)).toEqual(spec);
  });

  it.each(FIXTURES)('build --into with an unchanged dump changes nothing: %s', (_name, make) => {
    const p = make();
    const r = buildFromSpec(viaJson(p), p);
    expect(canonical(r.doc)).toEqual(canonical(p));
    expect(r.doc.id).toBe(p.id);
    expect(r.summary.added).toBe(0);
    expect(r.summary.removed).toBe(0);
  });

  it('dump writes ids for every stated node, leaves defaults and generated nodes out', () => {
    const spec = dumpToSpec(settingsProject());
    const settings = spec.screens[0];
    expect(settings).toMatchObject({ name: 'Settings', status: 'current', platform: 'phone', frameId: 'F-settings', x: 0, y: 0 });
    expect(settings.layout).toBeUndefined(); // the phone default
    expect(settings.root![0]).toEqual({ 'top-app-bar': { title: 'Settings', leading: 'none', actions: 0 }, id: 'bar' });
    expect(settings.root![2]).toEqual({ 'list-row': { title: 'Language', trailing: 'value', value: 'English' }, id: 'row-language' });
    expect(settings.root!.at(-1)).toEqual({ 'bottom-navigation': { selected: 3 }, id: 'nav', position: 'pinned-bottom' });
    expect(spec.flows).toEqual([{ id: expect.any(String), from: 'row-language', to: 'Language', label: 'Pick language' }]);
    expect(spec.notes).toHaveLength(2);
    expect(spec.notes![0]).toMatchObject({ text: 'Opens the system language list on Android 13+', on: 'row-language' });
  });

  it('repeat copies and instance contents are not in the dump; masters are, once', () => {
    const p = sharedProject();
    const spec = dumpToSpec(p);
    expect(spec.components!.map((c) => c.name)).toEqual(['Top bar', 'Trip card', 'Trip list']);
    const home = spec.screens.find((s) => s.name === 'Home')!;
    expect(home.root![0]).toMatchObject({ use: 'Top bar', id: 'topbar', bleed: true });
    expect(home.root![1]).toMatchObject({ vstack: [{ use: 'Trip card' }], repeat: 2 });
    const tripList = spec.components!.find((c) => c.name === 'Trip list')!;
    expect(tripList.content).toMatchObject({ vstack: [{ heading: { text: 'Upcoming' } }, { use: 'Trip card' }], gap: 8 });
    expect(spec.flows!.map((f) => f.from)).toContain('topbar~s~tb-title');
  });
});

describe('build --into', () => {
  /** Henrique's manual edits after the agent dumped: frame moved, a row given a fixed width, the FAB and a note moved. */
  function handEdits(p: DesignDocument): DesignDocument {
    return materializeDocument(
      produce(p, (d) => {
        const home = d.children.find((c) => c.id === 'F-home') as ScreenNode;
        home.transform.x = 40;
        home.transform.y = 120;
        (home.children.find((c) => c.id === 'title') as ComponentNode).layoutItem = { width: 260 };
        const fab = home.children.find((c) => c.id === 'fab')!;
        fab.transform.x = 20;
        fab.transform.y = 700;
      }),
    );
  }

  it('keeps manual sizes and positions the spec does not state (dump --no-geometry), and applies what it does', () => {
    const p = containersProject();
    const spec = JSON.parse(JSON.stringify(dumpToSpec(p, { geometry: false })));
    expect(JSON.stringify(spec, (k, v) => (k === 'node' ? undefined : v))).not.toMatch(/"(x|y|width)":|"size":\{/);
    // The agent edits the title; meanwhile Henrique moves and resizes things in the app.
    const home = spec.screens.find((s: { name: string }) => s.name === 'Home');
    home.root[0].heading.text = 'My trips';
    const edited = handEdits(p);
    const { doc } = buildFromSpec(spec, edited);
    const frame = findNode(doc, 'F-home') as ScreenNode;
    expect(frame.transform).toMatchObject({ x: 40, y: 120 });
    const title = findNode(doc, 'title') as ComponentNode;
    expect(title.component.props.text).toBe('My trips');
    expect(title.layoutItem).toEqual({ width: 260 });
    expect(title.component.size!.width).toBe(260);
    expect(findNode(doc, 'fab')!.transform).toMatchObject({ x: 20, y: 700 });
    expect(findNode(doc, 'free-card')!.transform).toMatchObject({ x: findNode(edited, 'free-card')!.transform.x, y: findNode(edited, 'free-card')!.transform.y });
    expect((findNode(doc, 'free-card') as GroupNode).layout!.size).toEqual((findNode(edited, 'free-card') as GroupNode).layout!.size);
    // Nothing else changed.
    const again = buildFromSpec(viaJson(edited), edited).doc;
    expect(canonical(doc)).toEqual(canonical(materializeDocument(produce(again, (d) => void ((findNode(d as DesignDocument, 'title') as ComponentNode).component.props.text = 'My trips')))));
  });

  it('notes keep their place; frames, free nodes and notes move when the spec says so', () => {
    const p = settingsProject();
    const moved = materializeDocument(produce(p, (d) => void (d.children.find((c) => c.type === 'group' && !!c.note)!.transform.x = 999)));
    const spec = JSON.parse(JSON.stringify(dumpToSpec(p, { geometry: false })));
    const kept = buildFromSpec(spec, moved).doc;
    expect(kept.children.find((c) => c.type === 'group' && !!c.note)!.transform.x).toBe(999);
    const full = viaJson(p);
    full.screens[1].x = 2000;
    const set = buildFromSpec(full, moved).doc;
    expect(findNode(set, 'F-language')!.transform.x).toBe(2000);
    expect(set.children.find((c) => c.type === 'group' && !!c.note)!.transform.x).toBe(p.children.find((c) => c.type === 'group' && !!c.note)!.transform.x);
  });

  it('removes only what the spec removed, adds what it adds, keeps notes / flows / components it does not mention', () => {
    const p = settingsProject();
    const spec = viaJson(p);
    const settings = spec.screens[0];
    settings.root = settings.root.filter((n: { id: string }) => n.id !== 'row-theme');
    settings.root.splice(2, 0, { 'list-row': { title: 'Storage', trailing: 'value', value: '2.1 GB' }, id: 'row-storage' });
    delete spec.notes;
    delete spec.flows;
    const r = buildFromSpec(spec, p);
    expect(findNode(r.doc, 'row-theme')).toBeNull();
    expect(findNode(r.doc, 'row-storage')).not.toBeNull();
    expect(r.doc.children.filter((c) => c.type === 'group' && !!c.note)).toHaveLength(2);
    expect(r.doc.wireframe!.flows).toEqual(p.wireframe!.flows);
    expect(r.summary).toMatchObject({ added: 1, removed: 1 });
  });

  it('a hand-written spec without ids updates the matching nodes in place (same parent, same index, same kind)', () => {
    const p = settingsProject();
    const spec = {
      screens: [
        {
          name: 'Settings',
          root: [
            { 'top-app-bar': { title: 'Preferences', leading: 'none', actions: 0 } },
            { 'section-header': 'GENERAL' },
            { 'list-row': { title: 'Language', trailing: 'value', value: 'Português' } },
          ],
        },
        { name: 'Language', root: [{ 'top-app-bar': 'Language' }] },
      ],
    };
    const { doc } = buildFromSpec(spec, p);
    expect((findNode(doc, 'bar') as ComponentNode).component.props.title).toBe('Preferences');
    expect((findNode(doc, 'row-language') as ComponentNode).component.props.value).toBe('Português');
    expect(findNode(doc, 'row-theme')).toBeNull();
    // The flow from the Language row survives (same node); the screens keep their ids and frames.
    expect(doc.wireframe!.flows).toEqual(p.wireframe!.flows);
    expect(doc.wireframe!.screens.map((s) => s.id)).toEqual(p.wireframe!.screens.map((s) => s.id));
  });

  it('refuses a project that is not a wireframe', () => {
    const p = settingsProject();
    expect(() => buildFromSpec({ screens: [] }, { ...p, wireframe: undefined })).toThrow(/wireframe/);
  });
});

/** Every node in a doc, for debugging failures. */
export const ids = (nodes: SceneNode[]): string[] => nodes.flatMap((n) => [n.id, ...(n.type === 'group' ? ids(n.children) : [])]);
