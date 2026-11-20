// Spec format for links from parts (docs/wireframe-spec.md → Links from parts): `"opens": { "<part>": "<screen>" }`
// on a component (by label or key), inside a shared component's content (every instance), `#part` in flow paths,
// errors that name the spec path, and what dump writes.
import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '@/model';
import { findNode } from '@/model';
import { flowSources, flowsOf } from '../../flows';
import { buildFromSpec, dumpToSpec, SpecError } from '..';

const SCREENS = ['Gallery', 'Files', 'Albums', 'Settings'];
const spec = (extra: Record<string, unknown> = {}) => ({
  components: [
    {
      name: 'Tab bar',
      content: {
        vstack: [{ id: 'nav', 'bottom-navigation': { labels: SCREENS }, opens: Object.fromEntries(SCREENS.map((s) => [s, s])) }],
        gap: 0,
      },
    },
  ],
  screens: SCREENS.map((name) => ({ name, platform: 'phone', root: [{ heading: name }, { use: 'Tab bar', position: 'pinned-bottom' }] })),
  ...extra,
});

describe('spec: links from parts', () => {
  it('"opens" with parts inside a shared component links every instance once; each screen selects its tab', () => {
    const { doc, warnings } = buildFromSpec(spec());
    expect(warnings).toEqual([]);
    const flows = flowsOf(doc);
    expect(flows).toHaveLength(4);
    expect(flows.every((f) => f.symbol && f.from === 'nav')).toBe(true);
    expect(flows.map((f) => f.part)).toEqual(['item:0', 'item:1', 'item:2', 'item:3']);
    for (const f of flows) expect(flowSources(doc, f)).toHaveLength(4);
    const navs = flowSources(doc, flows[0]).map((id) => findNode(doc, id) as ComponentNode);
    expect(navs.map((n) => n.component.resolved?.selected).sort()).toEqual([1, 2, 3, 4]);
  });

  it('parts by key, "#part" paths (screen and shared component), and labels', () => {
    const { doc } = buildFromSpec({
      screens: [
        { name: 'Home', platform: 'phone', root: [{ id: 'tabs', tabs: ['Photos', 'Videos'], opens: { 'item:1': 'Videos' } }, { id: 'bar', 'top-app-bar': { title: 'Home', leading: 'back' } }] },
        { name: 'Videos', platform: 'phone', root: [] },
      ],
      flows: [{ from: 'Home/Top app bar#Back', to: 'Videos', label: 'back' }, { from: 'tabs#photos', to: 'Home' }],
    });
    const flows = flowsOf(doc);
    expect(flows.map((f) => [f.from, f.part, f.label])).toEqual([
      ['bar', 'back', 'back'],
      ['tabs', 'item:0', undefined],
      ['tabs', 'item:1', undefined],
    ]);
  });

  it('a flow from a path inside a shared component ("Tab bar/…#Files") is defined in the master', () => {
    const s = spec();
    (s.components[0].content.vstack[0] as Record<string, unknown>).opens = undefined;
    const { doc } = buildFromSpec({ ...s, flows: [{ from: 'Tab bar/Bottom navigation#Files', to: 'Files' }] });
    const [f] = flowsOf(doc);
    expect(f).toMatchObject({ from: 'nav', part: 'item:1', symbol: doc.wireframe!.symbols![0].id });
  });

  it('names the spec path of a part that does not exist', () => {
    const s = spec();
    (s.components[0].content.vstack[0] as Record<string, unknown>).opens = { Photos: 'Gallery' };
    try {
      buildFromSpec(s);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SpecError);
      expect((e as SpecError).issues).toEqual([{ path: 'components[0].content.vstack[0].opens.Photos', message: '"Photos" is not a part of "Bottom navigation" (parts: "Gallery", "Files", "Albums", "Settings")' }]);
    }
    expect(() => buildFromSpec({ screens: [{ name: 'A', platform: 'phone', root: [{ heading: 'Hi', opens: { x: 'A' } }] }] })).toThrow(/has no parts to link from/);
    expect(() => buildFromSpec({ screens: [{ name: 'A', platform: 'phone', root: [{ heading: 'Hi', opens: { x: 3 } }] }] })).toThrow(/opens: expected a screen name, a list of them, or \{ "<part>": "<screen>" \}/);
  });

  it('a note inside a shared component is still an error; "selected": "auto" is accepted, other strings are not', () => {
    const s = spec();
    (s.components[0].content.vstack[0] as Record<string, unknown>).note = 'hi';
    expect(() => buildFromSpec(s)).toThrow(/"note" inside a shared component/);
    expect(() => buildFromSpec({ screens: [{ name: 'A', platform: 'phone', root: [{ tabs: { labels: ['a', 'b'], selected: 'auto' } }] }] })).not.toThrow();
    expect(() => buildFromSpec({ screens: [{ name: 'A', platform: 'phone', root: [{ tabs: { labels: ['a', 'b'], selected: 'first' } }] }] })).toThrow(/selected: expected a number or "auto", got "first"/);
  });

  it('dump writes parts by label (shared ones from the component) and builds back the same flows', () => {
    const { doc } = buildFromSpec(spec({ flows: [{ from: 'Gallery/Heading', to: 'Files' }] }));
    const out = JSON.parse(JSON.stringify(dumpToSpec(doc)));
    const heading = (doc.children[0] as { children: { id: string }[] }).children[0].id;
    expect(out.flows.map((f: { from: string; to: string }) => `${f.from} → ${f.to}`)).toEqual([
      `${heading} → Files`,
      'Tab bar/nav#Gallery → Gallery',
      'Tab bar/nav#Files → Files',
      'Tab bar/nav#Albums → Albums',
      'Tab bar/nav#Settings → Settings',
    ]);
    // "selected": "auto" is the default: not written.
    expect(JSON.stringify(out.components)).not.toContain('selected');
    const again = buildFromSpec(out).doc;
    expect(flowsOf(again)).toEqual(flowsOf(doc));
  });
});
