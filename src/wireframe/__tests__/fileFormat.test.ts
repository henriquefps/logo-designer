import { describe, expect, it } from 'vitest';
import { createDocument, hitTest, type ComponentNode, type ScreenNode } from '@/model';
import { parseProject, serializeProject, validateDocument } from '@/io/projectFile';
import { exportSvg, exportArea } from '@/io/svgExport';
import { materializeDocument } from '../pipeline';
import { addScreen } from '../screens';

const wf = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  artboard: { width: 10, height: 10 },
  wireframe: { screens: [{ id: 's1', name: 'Home' }] },
  children,
  ...extra,
});
const screen = (children: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  type: 'group',
  name: 'Home',
  screen: { screenId: 's1', platform: 'phone' },
  children,
  ...extra,
});
const err = (data: unknown) => {
  try {
    validateDocument(data);
  } catch (e) {
    return (e as Error).message;
  }
  return 'no error';
};

describe('wireframe file format', () => {
  it('fills screen defaults from the platform and keeps the wireframe fields', () => {
    const doc = validateDocument(
      wf([
        screen([
          { type: 'group', component: { kind: 'placeholder', props: { label: 'Hi' } }, layoutItem: { width: 'fill', height: 'hug', position: 'free' }, children: [] },
          { type: 'group', layout: { kind: 'grid' }, children: [] },
        ]),
      ]),
    );
    const s = doc.children[0] as ScreenNode;
    expect(doc.wireframe).toEqual({ screens: [{ id: 's1', name: 'Home' }] });
    expect(s.screen).toEqual({ screenId: 's1', platform: 'phone', width: 390, height: 844 });
    expect(s.children[0]).toMatchObject({ component: { kind: 'placeholder', props: { label: 'Hi' } }, layoutItem: { width: 'fill', height: 'hug', position: 'free' } });
    expect(s.children[1]).toMatchObject({ layout: { kind: 'grid', gap: 0, padding: 0, align: 'stretch', columns: 2 } });
    // Round trip.
    expect(parseProject(serializeProject(doc)).children).toEqual(doc.children);
  });

  it('names the JSON path of what is wrong', () => {
    expect(err(wf([{ type: 'rect', width: 1, height: 1, screen: { screenId: 's1' } }]))).toMatch(/children\[0\]\.screen: only a group can be a screen frame/);
    expect(err(wf([{ type: 'group', children: [screen()] }]))).toMatch(/children\[0\]\.children\[0\]\.screen: screen frames must be top-level/);
    expect(err(wf([screen([], { screen: { screenId: 's1', platform: 'watch' } })]))).toMatch(/children\[0\]\.screen\.platform: expected one of "phone", "tablet", "desktop", got "watch"/);
    expect(err(wf([screen([], { screen: { screenId: 's1', width: -5 } })]))).toMatch(/children\[0\]\.screen\.width: must be greater than 0/);
    expect(err(wf([screen([{ type: 'group', component: { props: {} }, children: [] }])]))).toMatch(/children\[0\]\.children\[0\]\.component\.kind: expected a string/);
    expect(err(wf([screen([{ type: 'group', component: { kind: 'placeholder', props: 3 }, children: [] }])]))).toMatch(/component\.props: expected an object/);
    expect(err(wf([screen([{ type: 'text', text: 'x', fontSize: 9, component: { kind: 'placeholder' } }])]))).toMatch(/children\[0\]\.children\[0\]\.component: only a group/);
    expect(err(wf([screen([{ type: 'group', layout: { gap: 4 }, children: [] }])]))).toMatch(/children\[0\]\.children\[0\]\.layout\.kind: expected one of "vstack", "hstack", "grid", got nothing/);
    expect(err(wf([screen([{ type: 'group', layout: { kind: 'grid', columns: 1.5 }, children: [] }])]))).toMatch(/layout\.columns: expected a whole number/);
    expect(err(wf([screen([{ type: 'rect', width: 1, height: 1, layoutItem: { width: 'big' } }])]))).toMatch(/children\[0\]\.children\[0\]\.layoutItem\.width: expected "fill", "hug" or a number/);
    expect(err(wf([screen([{ type: 'rect', width: 1, height: 1, layoutItem: { bleed: 'yes' } }])]))).toMatch(/children\[0\]\.children\[0\]\.layoutItem\.bleed: expected true or false/);
    expect(err(wf([], { wireframe: { screens: [{ id: 'a' }, { id: 'a' }] } }))).toMatch(/wireframe\.screens\[1\]\.id: duplicate/);
    expect(err(wf([], { icon: { preset: 'app-icon' } }))).toMatch(/wireframe: a document is either an app icon/);
  });

  it('loads unknown component kinds as plain groups, with a warning', () => {
    const warnings: string[] = [];
    const doc = validateDocument(wf([screen([{ type: 'group', component: { kind: 'hologram', props: {} }, children: [{ type: 'rect', width: 5, height: 5 }] }])]), { warnings });
    const g = (doc.children[0] as ScreenNode).children[0] as ComponentNode;
    expect(g.component).toBeUndefined();
    expect(g.children).toHaveLength(1);
    expect(warnings).toEqual([expect.stringMatching(/children\[0\]\.children\[0\]\.component\.kind: unknown component "hologram".*plain group/)]);
  });

  it('ignores wireframe fields in other documents, with a warning', () => {
    const warnings: string[] = [];
    const doc = validateDocument({ schemaVersion: 1, artboard: { width: 10, height: 10 }, children: [screen()] }, { warnings });
    expect(doc.wireframe).toBeUndefined();
    expect(doc.children[0]).not.toHaveProperty('screen');
    expect(warnings[0]).toMatch(/children\[0\]\.screen: ignored, only wireframe documents/);
  });
});

describe('screens on the canvas and in exports', () => {
  const make = () => {
    const doc = createDocument({ wireframe: { screens: [] } });
    const id = addScreen(doc, { layout: null, platform: 'phone', name: 'Home', x: 100, y: 50 });
    const s = doc.children[0] as ScreenNode;
    s.children.push(
      { ...(validateDocument(wf([{ type: 'rect', name: 'Card', width: 100, height: 100, transform: { x: 60, y: 60 }, fill: { kind: 'solid', color: '#000000' } }])).children[0]) },
      { ...(validateDocument(wf([{ type: 'rect', name: 'Overflow', width: 100, height: 100, transform: { x: 400, y: 60 }, fill: { kind: 'solid', color: '#000000' } }])).children[0]) },
    );
    return { doc: materializeDocument(doc), id };
  };

  it('hit testing: a click inside a screen picks its child, empty space the frame, clipped content nothing', () => {
    const { doc, id } = make();
    const card = (doc.children[0] as ScreenNode).children[0].id;
    expect(hitTest(doc, { x: 160, y: 110 })).toBe(card);
    expect(hitTest(doc, { x: 300, y: 600 })).toBe(id);
    // Overflow sits at local x 350..450 (world 450..550): the part outside the 390-wide frame is clipped.
    expect(hitTest(doc, { x: 520, y: 110 })).toBeNull();
    expect(hitTest(doc, { x: 480, y: 110 })).not.toBeNull();
  });

  it('exports one screen: its frame as the viewBox, white paper, content clipped', async () => {
    const { doc, id } = make();
    expect(exportArea(doc, { scope: 'screen', screenId: id })).toEqual({ x: 100, y: 50, width: 390, height: 844 });
    const { svg, width, height } = await exportSvg(doc, { scope: 'screen', screenId: id });
    expect([width, height]).toEqual([390, 844]);
    expect(svg).toContain('viewBox="100 50 390 844"');
    expect(svg).toMatch(/<clipPath id="clip1">\s*<rect width="390" height="844"\/>/);
    expect(svg).toContain('<rect width="390" height="844" fill="#ffffff"/>');
    expect(svg).toContain('clip-path="url(#clip1)"');
    await expect(exportSvg(doc, { scope: 'screen', screenId: 'nope' })).rejects.toThrow(/does not exist/);
    // The whole canvas: every screen, no artboard.
    expect(exportArea(doc)).toEqual({ x: 100, y: 50, width: 390, height: 844 });
  });
});
