// The spec format as an agent writes it: short forms, defaults, paths by name, node sugar, default
// placements, and errors that name the spec path.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findNode, type ComponentNode, type DesignDocument, type GroupNode, type ScreenNode } from '@/model';
import { frames } from '../../screens';
import { notesOf } from '../../notes';
import { getComponents } from '../../library/registry';
import { buildFromSpec, checkSpec, dumpToSpec, parseSpec, RESERVED_KEYS, SpecError } from '..';

const example = JSON.parse(readFileSync(resolve(__dirname, 'hoard-settings.spec.json'), 'utf8'));

const byName = (doc: DesignDocument, name: string) => frames(doc).find((f) => f.name === name)!;
const comp = (n: unknown) => (n as ComponentNode).component;
const issues = (spec: unknown) => checkSpec(spec).map((i) => `${i.path}: ${i.message}`);
const buildIssues = (spec: unknown) => {
  try {
    buildFromSpec(spec);
    return [];
  } catch (e) {
    if (e instanceof SpecError) return e.issues.map((i) => `${i.path}: ${i.message}`);
    throw e;
  }
};

describe('the Hoard settings example (docs/wireframe-spec.md)', () => {
  const { doc, warnings, summary } = buildFromSpec(example);

  it('builds two screens with a flow, a note and a shared tab bar', () => {
    expect(warnings).toEqual([]);
    expect(summary).toMatchObject({ screens: 2, frames: 2 });
    expect(doc.name).toBe('Hoard');
    expect(doc.wireframe!.screens.map((s) => [s.name, s.status])).toEqual([
      ['Settings', 'changed'],
      ['Server', 'new'],
    ]);
    const settings = byName(doc, 'Settings');
    expect(settings.screen.platform).toBe('phone');
    expect(settings.children.map((c) => (c.type === 'group' ? (c.component?.kind ?? (c.symbol ? 'use' : '?')) : c.type))).toEqual([
      'top-app-bar',
      'section-header',
      'list-row',
      'list-row',
      'section-header',
      'list-row',
      'list-row',
      'radio-group',
      'section-header',
      'list-row',
      'button',
      'use',
    ]);
    // Short form: a string sets the first text prop.
    expect(comp(settings.children[1]).props.label).toBe('SERVER');
    // Full props are stored, like an instance the app inserts.
    expect(comp(settings.children[2]).props).toMatchObject({ title: 'Server address', subtitle: 'hoard.hfps.dev', trailing: 'chevron', leading: 'none', divider: false });
    // The shared tab bar keeps its master's position: pinned to the bottom of each screen.
    const tab = settings.children[11] as GroupNode;
    expect(tab.layoutItem).toEqual({ position: 'pinned-bottom' });
    expect(tab.transform.y + (tab.layout!.size!.height ?? 0)).toBeCloseTo(settings.screen.height);
    // Laid out by the pipeline: rows stacked, screen height grown with the content.
    expect(settings.screen.height).toBeGreaterThanOrEqual(844);
    expect(settings.children[2].transform.y).toBeGreaterThan(settings.children[1].transform.y);
  });

  it('resolves "opens", flows by path and notes by path and by node', () => {
    const flows = doc.wireframe!.flows!;
    const server = doc.wireframe!.screens.find((s) => s.name === 'Server')!;
    const settingsId = doc.wireframe!.screens.find((s) => s.name === 'Settings')!.id;
    expect(flows).toHaveLength(2);
    expect(flows[0]).toMatchObject({ from: byName(doc, 'Server').children[3].id, to: settingsId, label: 'Saved' });
    expect(flows[1]).toMatchObject({ from: 'row-server', to: server.id });
    const notes = notesOf(doc);
    expect(notes.map((n) => [n.note.text, n.note.target])).toEqual([
      ['Show a spinner in the Status row while connecting', byName(doc, 'Settings').children[3].id],
      ['Hidden when automatic backup is off', byName(doc, 'Settings').children[6].id],
    ]);
    // Placed right of the screen, not on top of each other.
    // Next to the Settings frame, on its left: the right column would cover the Server frame beside it.
    expect(notes[0].transform.x + 200).toBeLessThanOrEqual(byName(doc, 'Settings').transform.x);
    expect(notes[1].transform.y).not.toBe(notes[0].transform.y);
  });

  it('places new screens side by side', () => {
    const [a, b] = frames(doc);
    expect(a.transform).toMatchObject({ x: 0, y: 0 });
    expect(b.transform.x).toBeGreaterThan(a.transform.x + a.screen.width);
    expect(b.transform.y).toBe(0);
  });

  it('dumps back to a spec that builds the same project', () => {
    const again = buildFromSpec(JSON.parse(JSON.stringify(dumpToSpec(doc)))).doc;
    expect(again.children).toEqual(doc.children);
    expect(again.wireframe).toEqual(doc.wireframe);
  });

  it('is the example printed in docs/wireframe-spec.md', () => {
    const md = readFileSync(resolve(__dirname, '../../../../docs/wireframe-spec.md'), 'utf8');
    const block = md.match(/<!-- example:hoard-settings -->\s*```json\n([\s\S]*?)```/);
    expect(block, 'the example block in docs/wireframe-spec.md').not.toBeNull();
    expect(JSON.parse(block![1])).toEqual(example);
  });
});

describe('short forms and defaults', () => {
  it('accepts { kind: props }, { kind: "text" }, { kind: [list] }, { kind: null } and the explicit form', () => {
    const { doc } = buildFromSpec({
      screens: [
        {
          name: 'Home',
          root: [
            { heading: 'Welcome' },
            { tabs: ['Photos', 'Albums'] },
            { divider: null },
            { kind: 'button', props: { label: 'Go' } },
            { 'list-row': { title: 'Row', leadingIcon: 'heart', leading: 'icon' } },
          ],
        },
      ],
    });
    const kids = byName(doc, 'Home').children;
    expect(comp(kids[0]).props.text).toBe('Welcome');
    expect(comp(kids[1]).kind).toBe('tabs');
    expect(Object.values(comp(kids[1]).props)).toContainEqual(['Photos', 'Albums']);
    expect(comp(kids[2]).kind).toBe('divider');
    expect(comp(kids[3]).props.label).toBe('Go');
    // Icon shorthands are normalized like everywhere else.
    expect(comp(kids[4]).props.leadingIcon).toBe('lucide:Heart');
  });

  it('screens default to phone with the platform stack; variants, free frames and frame layouts', () => {
    const { doc } = buildFromSpec({
      screens: [
        { name: 'A', root: [] },
        { name: 'B', variants: [{ platform: 'phone' }, { platform: 'desktop', layout: { padding: 0, gap: 0 } }] },
        { name: 'C', platform: 'tablet', layout: 'free', root: [{ heading: 'Free', x: 40, y: 60 }] },
      ],
    });
    const fs = frames(doc);
    expect(fs.map((f) => [f.name, f.screen.platform])).toEqual([
      ['A', 'phone'],
      ['B', 'phone'],
      ['B', 'desktop'],
      ['C', 'tablet'],
    ]);
    expect(fs[0].layout).toMatchObject({ kind: 'vstack', padding: 16, gap: 12 });
    expect(fs[2].layout).toMatchObject({ kind: 'vstack', padding: 0, gap: 0, align: 'start' });
    expect(fs[3].layout).toBeUndefined();
    expect(fs[3].children[0].transform).toMatchObject({ x: 40, y: 60 });
    // B's desktop variant sits next to its phone frame (one logical screen).
    expect(fs[1].screen.screenId).toBe(fs[2].screen.screenId);
  });

  it('gives frame children their default placement (pinned nav, FAB bottom right); free without x / y is centred', () => {
    const { doc } = buildFromSpec({ screens: [{ name: 'Home', root: [{ heading: 'Hi' }, { 'bottom-navigation': {} }, { fab: {} }, { modal: {}, position: 'free' }] }] });
    const [, nav, fab, modal] = byName(doc, 'Home').children as GroupNode[];
    expect(nav.layoutItem).toEqual({ position: 'pinned-bottom' });
    expect(fab.layoutItem).toEqual({ position: 'free' });
    expect(fab.transform.x).toBeGreaterThan(250);
    expect(fab.transform.y).toBeGreaterThan(600);
    expect(modal.layoutItem).toEqual({ position: 'free' });
    expect(modal.transform.x).toBeGreaterThan(0);
    // In the flow on request.
    const flow = buildFromSpec({ screens: [{ name: 'Home', root: [{ fab: {}, position: 'flow' }] }] }).doc;
    expect(byName(flow, 'Home').children[0].layoutItem).toEqual({ position: 'flow' });
  });

  it('containers: defaults per kind, repeat, style, sizes', () => {
    const { doc } = buildFromSpec({
      screens: [
        {
          name: 'Home',
          root: [
            { vstack: [{ vstack: [{ heading: 'Card' }, { text: 'Body' }], style: 'outline', radius: 'small', padding: 16, gap: 8 }], gap: 16, repeat: 3, id: 'cards' },
            { grid: [{ image: {} }], columns: 3 },
            { hstack: [{ button: 'A' }, { button: 'B' }], width: 200 },
          ],
        },
      ],
    });
    const [cards, grid, row] = byName(doc, 'Home').children as GroupNode[];
    expect(cards.name).toBe('Vertical stack');
    expect(cards.children[0].name).toBe('Card container');
    expect(cards.children).toHaveLength(3); // the template + 2 copies
    expect(cards.children[1].repeatCopy).toEqual({ template: cards.children[0].id, index: 2 });
    expect(grid.layout).toMatchObject({ kind: 'grid', columns: 3, gap: 12, align: 'stretch' });
    expect(grid.name).toBe('Grid');
    expect(row.layout).toMatchObject({ kind: 'hstack', gap: 8, align: 'center' });
    expect(row.layoutItem).toEqual({ width: 200 });
    expect(row.layout!.size!.width).toBe(200);
  });

  it('nested shared components, in a repeat, flows from inside an instance by path', () => {
    const { doc } = buildFromSpec({
      components: [
        { name: 'Trip list', content: { vstack: [{ heading: 'Upcoming' }, { use: 'Trip card' }] } },
        { name: 'Trip card', content: { vstack: [{ image: {} }, { heading: { text: 'Lisbon' }, id: 'title' }], style: 'outline' } },
      ],
      screens: [
        { name: 'Home', root: [{ vstack: [{ use: 'Trip card', id: 'card' }], repeat: 2 }, { use: 'Trip list' }] },
        { name: 'Trip', root: [] },
      ],
      flows: [{ from: 'Home/card/Lisbon', to: 'Trip' }],
    });
    const home = byName(doc, 'Home');
    const list = home.children[0] as GroupNode;
    expect(list.children).toHaveLength(2);
    const card = list.children[0] as GroupNode;
    expect(card.symbol).toBeDefined();
    expect(findNode(doc, 'card~s~title')).not.toBeNull();
    expect(doc.wireframe!.flows![0].from).toBe('card~s~title');
    const tripList = home.children[1] as GroupNode;
    const nested = tripList.children[1] as GroupNode;
    expect(nested.symbol!.id).toBe(doc.wireframe!.symbols!.find((s) => s.name === 'Trip card')!.id);
    expect(nested.children.length).toBe(2);
  });

  it('component kinds never collide with the spec\'s own keys', () => {
    for (const d of getComponents()) expect(RESERVED_KEYS.has(d.kind), d.kind).toBe(false);
  });
});

describe('errors name the spec path', () => {
  it('a bad choice lists the options', () => {
    expect(issues({ screens: [{ name: 'A', root: [] }, { name: 'B', root: [{ heading: 'x' }, {}, {}, { 'list-row': { trailing: 'arrow' } }] }] })).toContain(
      'screens[1].root[3].list-row.trailing: "arrow" is not one of none, chevron, toggle, value, checkbox',
    );
  });

  it('unknown kinds, props and keys get suggestions; several problems come back together', () => {
    const found = issues({
      screens: [
        {
          name: 'A',
          root: [{ 'list-rwo': {} }, { 'list-row': { titel: 'x' } }, { heading: 'x', gap: 4 }, { vstack: [{ button: { label: 5 } }], colums: 2 }, { heading: 'a', button: 'b' }],
        },
      ],
      screnes: [],
    });
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^screens\[0\]\.root\[0\]\.list-rwo: unknown component kind \(did you mean "list-row"\?\)/),
        expect.stringMatching(/^screens\[0\]\.root\[1\]\.list-row\.titel: list-row has no prop "titel" \(did you mean "title"\?\)/),
        'screens[0].root[2].gap: only stacks and grids take "gap"',
        'screens[0].root[3].vstack[0].button.label: expected text, got 5',
        expect.stringMatching(/^screens\[0\]\.root\[3\]\.colums: unknown key \(did you mean "columns"\?\)/),
        expect.stringMatching(/^screens\[0\]\.root\[4\]: has several node kinds/),
        expect.stringMatching(/^screnes: unknown key \(did you mean "screens"\?\)/),
      ]),
    );
  });

  it('screens, platforms, ids and numbers', () => {
    const found = issues({
      screens: [
        { name: 'A', platform: 'watch', root: [] },
        { name: 'a', root: [{ heading: 'x', id: 'h' }, { heading: 'y', id: 'h' }, { 'radio-group': { selected: 99 } }] },
        { name: 'C', variants: [{ platform: 'phone' }, { platform: 'phone' }] },
      ],
    });
    expect(found).toEqual(
      expect.arrayContaining([
        'screens[0].platform: "watch" is not one of phone, tablet, desktop',
        'screens[1].name: "a" is already the name of screens[0] (screen names are unique)',
        'screens[1].root[1].id: id "h" is already used at screens[1].root[0].id',
        'screens[1].root[2].radio-group.selected: 99 is out of range (0..11)',
        'screens[2].variants[1].platform: a second phone variant (one frame per platform)',
      ]),
    );
  });

  it('references that do not resolve', () => {
    const found = buildIssues({
      screens: [{ name: 'Settings', root: [{ 'list-row': 'Language', opens: 'Lang' }, { use: 'Top bar' }] }],
      flows: [{ from: 'Settings/Langauge', to: 'Settings' }],
      notes: [{ text: 'x', on: 'Nowhere/thing' }],
    });
    expect(found).toEqual(expect.arrayContaining([expect.stringMatching(/^screens\[0\]\.root\[1\]\.use: no shared component "Top bar"/)]));
    const later = buildIssues({
      screens: [{ name: 'Settings', root: [{ 'list-row': 'Language', opens: 'Lang' }] }],
      flows: [{ from: 'Settings/Langauge', to: 'Settings' }],
      notes: [{ text: 'x', on: 'Nowhere/thing' }],
    });
    expect(later).toEqual(
      expect.arrayContaining([
        'flows[0].from: "Langauge" matches nothing in "Settings" (a segment matches a node\'s id, name or label)',
        expect.stringMatching(/^notes\[0\]\.on: no node or screen "Nowhere"/),
        expect.stringMatching(/^screens\[0\]\.root\[0\]\.opens: no screen "Lang"/),
      ]),
    );
  });

  it('parseSpec throws a SpecError whose message lists every issue', () => {
    expect(() => parseSpec({ screens: [{ root: [] }] })).toThrow(SpecError);
    expect(() => parseSpec({ screens: [{ root: [] }] })).toThrow('screens[0].name: is required');
    expect(() => parseSpec('nope')).toThrow(/JSON object with "screens"/);
  });

  it('a frame can be referred to by @platform', () => {
    const { doc } = buildFromSpec({
      screens: [{ name: 'S', variants: [{ platform: 'phone', root: [{ button: 'Go' }] }, { platform: 'tablet', root: [{ button: 'Go' }] }] }, { name: 'T' }],
      flows: [{ from: 'S@tablet/Go', to: 'T' }],
    });
    const tablet = frames(doc).find((f) => f.screen.platform === 'tablet') as ScreenNode;
    expect(doc.wireframe!.flows![0].from).toBe(tablet.children[0].id);
  });
});
