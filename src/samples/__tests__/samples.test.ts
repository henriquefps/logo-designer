// Sample projects (src/samples): the registry points at real files, opening one always makes a new copy, and the
// bundled Roam sample is a valid, complete wireframe that round-trips through the spec format.
import 'fake-indexeddb/auto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateDocument } from '@/io/projectFile';
import { findNode, type DesignDocument, type SceneNode } from '@/model';
import { DESIGN_MODES } from '@/dialogs/newDocument/modes';
import { getComponent } from '@/wireframe/library/registry';
import { flowSources } from '@/wireframe/flows';
import { buildFromSpec, dumpToSpec } from '@/wireframe/spec';
import { SAMPLES, sampleById, samplesFor } from '../registry';
import { sampleBaseName, sampleCopy, uniqueName } from '../copy';

const PUBLIC = join(__dirname, '../../../public');
const loadBundled = (file: string): { doc: DesignDocument; warnings: string[] } => {
  const warnings: string[] = [];
  const doc = validateDocument(JSON.parse(readFileSync(join(PUBLIC, file), 'utf8')), { warnings });
  return { doc, warnings };
};

describe('samples registry', () => {
  it('has unique ids, a known mode, one-line descriptions and files that exist in public/', () => {
    expect(SAMPLES.length).toBeGreaterThan(0);
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(SAMPLES.length);
    for (const s of SAMPLES) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(DESIGN_MODES.map((m) => m.id)).toContain(s.mode);
      expect(s.description).not.toMatch(/\n/);
      expect(s.file).toMatch(/^samples\/.+\.designer\.json$/);
      expect(existsSync(join(PUBLIC, s.file)), s.file).toBe(true);
      expect(existsSync(join(PUBLIC, s.thumbnail)), s.thumbnail).toBe(true);
      // Thumbnails stay small (they show in a 64 px card).
      expect(statSync(join(PUBLIC, s.thumbnail)).size).toBeLessThan(80 * 1024);
    }
  });

  it('every sample is a valid project of its mode', () => {
    for (const s of SAMPLES) {
      const { doc, warnings } = loadBundled(s.file);
      expect(warnings).toEqual([]);
      if (s.mode === 'wireframe') expect(doc.wireframe).toBeDefined();
      if (s.mode === 'icon') expect(doc.icon).toBeDefined();
      expect(doc.live).toBeUndefined();
    }
  });

  it('finds samples by id and by mode', () => {
    expect(sampleById('roam')?.name).toBe('Roam');
    expect(sampleById('nope')).toBeUndefined();
    expect(samplesFor('wireframe').map((s) => s.id)).toContain('roam');
    expect(samplesFor('icon').map((s) => s.id)).not.toContain('roam');
  });
});

describe('opening a sample makes a copy', () => {
  const { doc } = loadBundled('samples/roam.designer.json');

  it('names: "<name> (sample)", then " 2", " 3"… past the names taken', () => {
    expect(sampleBaseName({ name: 'Roam' })).toBe('Roam (sample)');
    expect(uniqueName('Roam (sample)', [])).toBe('Roam (sample)');
    expect(uniqueName('Roam (sample)', ['Roam (sample)'])).toBe('Roam (sample) 2');
    expect(uniqueName('Roam (sample)', ['Roam (sample)', 'Roam (sample) 2', 'Roam (sample) 4'])).toBe('Roam (sample) 3');
  });

  it('gets a new id and fresh timestamps, drops the live mark, and leaves the original untouched', () => {
    const live = { ...doc, live: { editedBy: 'cli' } } as DesignDocument;
    const before = JSON.stringify(live);
    const copy = sampleCopy(live, { name: 'Roam' }, ['Roam (sample)'], 1234);
    expect(copy.id).not.toBe(doc.id);
    expect(copy.id).toMatch(/^d/);
    expect(copy.name).toBe('Roam (sample) 2');
    expect(copy.createdAt).toBe(1234);
    expect(copy.updatedAt).toBe(1234);
    expect(copy.live).toBeUndefined();
    expect(JSON.stringify(live)).toBe(before);
    // Content is a deep copy.
    expect(copy.children).not.toBe(live.children);
    expect(copy.children).toEqual(live.children);
    expect(sampleCopy(doc, { name: 'Roam' }).id).not.toBe(copy.id);
  });

  describe('in the app (openSample)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('imports a new project every time, never over an existing one, and opens it', async () => {
      const text = readFileSync(join(PUBLIC, 'samples/roam.designer.json'), 'utf8');
      const fetchMock = vi.fn(async () => new Response(text, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const { useProjectsStore } = await import('@/store/useProjectsStore');
      const { useDocStore } = await import('@/store/useDocStore');
      const { openSample } = await import('../open');
      const p = () => useProjectsStore.getState();
      await p().init();
      // The first visit's empty document is not left behind.
      const empty = p().activeId!;
      expect(p().projects).toHaveLength(1);

      const first = await openSample('roam');
      expect(fetchMock).toHaveBeenCalledWith('/samples/roam.designer.json');
      expect(p().activeId).toBe(first);
      expect(useDocStore.getState().doc.name).toBe('Roam (sample)');
      expect(useDocStore.getState().doc.wireframe?.screens).toHaveLength(13);
      expect(p().projects.map((m) => m.id)).toEqual([first]);
      expect(p().projects.map((m) => m.id)).not.toContain(empty);

      // Edit it, then open the sample again: a second project, the first one keeps its edits.
      await p().rename(first, 'My Roam');
      const second = await openSample('roam');
      expect(second).not.toBe(first);
      expect(p().projects.map((m) => m.name).sort()).toEqual(['My Roam', 'Roam (sample)']);
      const third = await openSample('roam');
      expect(new Set([first, second, third]).size).toBe(3);
      expect(p().projects.find((m) => m.id === third)?.name).toBe('Roam (sample) 2');
      expect(p().projects).toHaveLength(3);

      await expect(openSample('nope')).rejects.toThrow(/Unknown sample/);
    });

    it('reports a missing file', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
      const { openSample } = await import('../open');
      await expect(openSample('roam')).rejects.toThrow(/Could not load the Roam sample \(404\)/);
    });
  });
});

describe('the Roam sample', () => {
  const { doc } = loadBundled('samples/roam.designer.json');
  const wf = doc.wireframe!;
  const screen = (name: string) => wf.screens.find((s) => s.name === name)!;
  const frameOf = (name: string) => doc.children.find((c) => c.screen?.screenId === screen(name).id)!;
  const all: SceneNode[] = [];
  const walk = (n: SceneNode) => {
    all.push(n);
    if (n.type === 'group') n.children.forEach(walk);
  };
  doc.children.forEach(walk);

  it('is "Roam (sample)" with the app screens and the Settings story, names unique', () => {
    expect(doc.name).toBe('Roam (sample)');
    expect(wf.screens.map((s) => s.name)).toEqual([
      'Explore',
      'Trips',
      'Lisbon, Portugal',
      'Settings',
      'Settings (new)',
      'Account',
      'Notifications',
      'Trip settings',
      'Payments',
      'Privacy',
      'Data & storage',
      'General',
      'Help & about',
    ]);
    expect(new Set(wf.screens.map((s) => s.name)).size).toBe(wf.screens.length);
  });

  it('keeps the statuses: Settings current, Settings (new) changed, sub-screens and Lisbon new', () => {
    const status = Object.fromEntries(wf.screens.map((s) => [s.name, s.status ?? null]));
    expect(status).toMatchObject({ Explore: null, Trips: null, 'Lisbon, Portugal': 'new', Settings: 'current', 'Settings (new)': 'changed' });
    for (const n of ['Account', 'Notifications', 'Trip settings', 'Payments', 'Privacy', 'Data & storage', 'General', 'Help & about']) expect(status[n]).toBe('new');
  });

  it('renames the Settings "Trips" sub-screen everywhere: screen, menu row, top bar', () => {
    const toTripSettings = wf.flows!.filter((f) => f.to === screen('Trip settings').id);
    expect(toTripSettings).toHaveLength(1);
    const row = findNode(doc, toTripSettings[0].from)!;
    expect(row.component).toMatchObject({ kind: 'list-row', props: { title: 'Trip settings' } });
    const topBar = (frameOf('Trip settings') as { children: SceneNode[] }).children.find((c) => c.component?.kind === 'top-app-bar')!;
    expect(topBar.component!.props.title).toBe('Trip settings');
  });

  it('links the shared tab bar: Trips and Profile (→ Settings (new)) on the master, so every tab screen has them', () => {
    const tabBar = wf.symbols!.find((s) => s.name === 'Tab bar')!;
    const shared = wf.flows!.filter((f) => f.symbol === tabBar.id);
    expect(shared.map((f) => [f.part, wf.screens.find((s) => s.id === f.to)?.name])).toEqual([
      ['item:1', 'Trips'],
      ['item:3', 'Settings (new)'],
    ]);
    // Every instance of the tab bar is a source of the Profile link.
    const profile = shared.find((f) => f.part === 'item:3')!;
    expect(flowSources(doc, profile)).toHaveLength(3);
  });

  it('keeps the flows and notes, with nothing dangling', () => {
    expect(wf.flows).toHaveLength(20);
    const ids = new Set(all.map((n) => n.id));
    const screenIds = new Set(wf.screens.map((s) => s.id));
    for (const f of wf.flows!) {
      expect(screenIds.has(f.to), f.id).toBe(true);
      expect(flowSources(doc, f).length, f.id).toBeGreaterThan(0);
    }
    const notes = all.filter((n) => n.note);
    expect(notes).toHaveLength(5);
    for (const n of notes) if (n.note!.target) expect(ids.has(n.note!.target), n.id).toBe(true);
    expect(notes.map((n) => n.note!.text).join(' ')).toMatch(/split into 8 entries/);
    // Every frame belongs to a listed screen and every screen has a frame.
    const frames = doc.children.filter((c) => c.screen);
    expect(frames.map((f) => f.screen!.screenId).sort()).toEqual([...screenIds].sort());
  });

  it('uses only component kinds the library has', () => {
    const kinds = new Set(all.filter((n) => n.component).map((n) => n.component!.kind));
    for (const s of wf.symbols ?? []) {
      const w = (n: SceneNode) => {
        if (n.component) kinds.add(n.component.kind);
        if (n.type === 'group') n.children.forEach(w);
      };
      w(s.content);
    }
    expect(kinds.size).toBeGreaterThan(5);
    for (const k of kinds) expect(getComponent(k), k).toBeDefined();
  });

  it('lays the frames out in two rows without overlaps', () => {
    const frames = doc.children.filter((c) => c.screen).map((c) => ({ name: wf.screens.find((s) => s.id === c.screen!.screenId)!.name, x: c.transform.x, y: c.transform.y, w: c.screen!.width, h: c.screen!.height! }));
    const rows = new Set(frames.map((f) => f.y));
    expect(rows.size).toBe(2);
    const firstRow = frames.filter((f) => f.y === 0).map((f) => f.name);
    expect(firstRow.sort()).toEqual(['Explore', 'Lisbon, Portugal', 'Trips']);
    for (const a of frames)
      for (const b of frames) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
  });

  it('round-trips through the spec: dump(build(dump(p))) equals dump(p)', () => {
    const spec = JSON.parse(JSON.stringify(dumpToSpec(doc)));
    const { doc: rebuilt } = buildFromSpec(spec);
    expect(JSON.parse(JSON.stringify(dumpToSpec(rebuilt)))).toEqual(spec);
    expect(() => validateDocument(JSON.parse(JSON.stringify(rebuilt)))).not.toThrow();
    // And build --into with its own dump changes nothing.
    const into = buildFromSpec(spec, doc);
    expect(into.summary.added).toBe(0);
    expect(into.summary.removed).toBe(0);
  });

  it('is the committed spec built (scripts/samples/roam.spec.json)', () => {
    const committed = JSON.parse(readFileSync(join(__dirname, '../../../scripts/samples/roam.spec.json'), 'utf8'));
    const { $schema: _a, ...fromFile } = JSON.parse(JSON.stringify(dumpToSpec(doc)));
    const { $schema: _b, ...fromSpec } = JSON.parse(JSON.stringify(dumpToSpec(buildFromSpec(committed).doc)));
    void _a;
    void _b;
    // Flow ids the merge did not state are generated; compare the rest.
    const strip = (s: { flows?: { id?: string }[] }) => ({ ...s, flows: s.flows?.map(({ id: _id, ...f }) => (void _id, f)) });
    expect(strip(fromSpec)).toEqual(strip(fromFile));
  });
});
