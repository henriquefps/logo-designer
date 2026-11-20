// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocument, createGroup, type ComponentNode, type DesignDocument, type ScreenNode } from '@/model';
import { serializeProject } from '@/io/projectFile';
import { addFlow, setScreenStatus } from '@/wireframe/flows';
import { addNote } from '@/wireframe/notes';
import { materializeDocument } from '@/wireframe/pipeline';
import { addScreen } from '@/wireframe/screens';
import { segmentHitsRect } from '@/wireframe/routing';
import { main } from './main';
import { compareLayout, imageSize, parseCompareArgs, parseSheetArgs, sheetLayout, solveScale, WfUsageError } from './wfView';

const comp = (id: string, kind: string, props: Record<string, unknown>): ComponentNode => ({ ...createGroup({ name: `${kind} ${id}` }), id, component: { kind, props } });

/** Home (phone, 0,0) → Settings (phone 0,1000 + tablet) and Gallery (phone 600,0); Settings → Language (600,1000). */
function fixture(): DesignDocument {
  const doc = createDocument({ name: 'App', wireframe: { screens: [] } });
  const body = (id: string, kids: ComponentNode[]) => ((doc.children.find((n) => n.id === id) as ScreenNode).children = kids);
  body(addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0 }), [comp('r-set', 'list-row', { title: 'Settings', trailing: 'chevron' }), comp('r-gal', 'list-row', { title: 'Gallery', trailing: 'chevron' })]);
  addScreen(doc, { platform: 'phone', name: 'Gallery', x: 600, y: 0 });
  const settings = addScreen(doc, { platform: 'phone', name: 'Settings', x: 0, y: 1000 });
  body(settings, [comp('r-lang', 'list-row', { title: 'Language', trailing: 'value', value: 'English' })]);
  addScreen(doc, { platform: 'tablet', name: 'Settings', x: 0, y: 2200, screenId: (doc.children.find((n) => n.id === settings) as ScreenNode).screen.screenId });
  addScreen(doc, { platform: 'phone', name: 'Language', x: 600, y: 1000 });
  const d = structuredClone(materializeDocument(doc));
  const sid = (name: string) => d.wireframe!.screens.find((s) => s.name === name)!.id;
  addFlow(d, 'r-set', sid('Settings'), 'tap');
  addFlow(d, 'r-gal', sid('Gallery'));
  addFlow(d, 'r-lang', sid('Language'), 'choose');
  setScreenStatus(d, sid('Home'), 'current');
  setScreenStatus(d, sid('Language'), 'new');
  addNote(d, { text: 'From the server', target: 'r-lang' });
  return structuredClone(materializeDocument(d));
}

const defaults = { notes: false, scale: 1, max: 4096 };

describe('arguments', () => {
  it('sheet: defaults and validation', () => {
    expect(parseSheetArgs({})).toEqual({ platform: undefined, notes: false, scale: 1, max: 4096 });
    expect(parseSheetArgs({ platform: 'tablet', notes: true, scale: '0.5', max: '2000' })).toEqual({ platform: 'tablet', notes: true, scale: 0.5, max: 2000 });
    expect(() => parseSheetArgs({ scale: '0' })).toThrow(/--scale must be/);
    expect(() => parseSheetArgs({ scale: 'big' })).toThrow(WfUsageError);
    expect(() => parseSheetArgs({ max: '99999' })).toThrow(/--max must be/);
    expect(() => parseSheetArgs({ platform: 'watch' })).toThrow(/--platform must be one of phone, tablet, desktop/);
  });

  it('compare: --screen is required; grid and overlay are checked', () => {
    expect(() => parseCompareArgs({})).toThrow(/needs --screen/);
    expect(parseCompareArgs({ screen: 'Home', grid: '8', overlay: '50' })).toMatchObject({ screen: 'Home', grid: 8, overlay: 50, scale: 1, max: 4096 });
    expect(parseCompareArgs({ screen: 'Home', overlay: '0' }).overlay).toBe(0);
    expect(() => parseCompareArgs({ screen: 'Home', grid: '0' })).toThrow(/--grid must be/);
    expect(() => parseCompareArgs({ screen: 'Home', overlay: '101' })).toThrow(/--overlay must be/);
    expect(() => parseCompareArgs({ screen: 'Home', overlay: 'half' })).toThrow(/--overlay must be/);
  });
});

describe('scaling', () => {
  it('keeps the scale when the image fits and shrinks the long side to max otherwise', () => {
    const fits = solveScale(1000, 800, 0, 1, 4096);
    expect(fits.scale).toBe(1);
    const big = solveScale(10000, 6000, 0, 1, 4096);
    expect(big.scale).toBeLessThan(0.41);
    expect(10000 * big.scale + 64).toBeLessThanOrEqual(4096 + 1e-6);
    const tall = solveScale(1000, 9000, 0, 1, 4096);
    expect(9000 * tall.scale + tall.strip + 64).toBeLessThanOrEqual(4096 + 1e-6);
    expect(solveScale(1000, 800, 0, 0.5, 4096).scale).toBe(0.5);
    expect(solveScale(1000, 800, 0, 4, 2000).scale).toBeLessThan(2);
  });
});

describe('sheet layout', () => {
  it('places every frame as on the canvas, relative to the top-left one', () => {
    const L = sheetLayout(fixture(), defaults);
    expect(L.frames.map((f) => `${f.frame.name}/${f.frame.screen.platform}`)).toEqual(['Home/phone', 'Gallery/phone', 'Settings/phone', 'Settings/tablet', 'Language/phone']);
    const [home, gallery, settings] = L.frames.map((f) => f.rect);
    expect(L.scale).toBeLessThanOrEqual(1);
    expect(gallery.x - home.x).toBeCloseTo(600 * L.scale);
    expect(settings.y - home.y).toBeCloseTo(1000 * L.scale);
    expect(home.width).toBeCloseTo(390 * L.scale);
    expect(Math.max(L.width, L.height)).toBeLessThanOrEqual(4096);
    // The label strip sits above the first row.
    expect(home.y).toBeGreaterThan(L.labelSize);
  });

  it('shrinks to --max and honours --scale', () => {
    const doc = fixture();
    expect(Math.max(sheetLayout(doc, { ...defaults, max: 1000 }).height, sheetLayout(doc, { ...defaults, max: 1000 }).width)).toBeLessThanOrEqual(1000);
    const half = sheetLayout(doc, { ...defaults, scale: 0.25 });
    expect(half.scale).toBe(0.25);
    expect(half.frames[0].rect.width).toBeCloseTo(97.5);
  });

  it('badges follow the status, names and platform come from the canvas label rules', () => {
    const L = sheetLayout(fixture(), defaults);
    const byName = (n: string) => L.frames.find((f) => f.frame.name === n && f.frame.screen.platform === 'phone')!;
    expect(byName('Home')).toMatchObject({ badge: 'Current', status: 'current', name: 'Home' });
    expect(byName('Language')).toMatchObject({ badge: 'New', status: 'new' });
    expect(byName('Gallery').badge).toBeNull();
    expect(byName('Home').detail).toMatch(/Phone/);
  });

  it('draws one arrow per flow, from the canvas geometry, and --platform drops flows to hidden frames', () => {
    const doc = fixture();
    const L = sheetLayout(doc, defaults);
    expect(L.arrows.map((a) => a.label)).toEqual(['tap', undefined, 'choose']);
    // The arrow to Gallery starts at Home's right edge and ends on Gallery's left edge.
    const home = L.frames[0].rect;
    const gallery = L.frames[1].rect;
    const toGallery = L.arrows[1];
    expect(toGallery.points[0].x).toBeCloseTo(home.x + home.width, 3);
    expect(toGallery.points[toGallery.points.length - 1].x).toBeCloseTo(gallery.x, 3);
    expect(toGallery.dir).toEqual({ x: 1, y: 0 });
    // Arrows never pass over a frame other than their own two; labels sit off every frame.
    for (const a of L.arrows) {
      const own = L.frames.filter((fr) => [a.points[0], a.points[a.points.length - 1]].some((p) => p.x >= fr.rect.x - 0.01 && p.x <= fr.rect.x + fr.rect.width + 0.01 && p.y >= fr.rect.y - 0.01 && p.y <= fr.rect.y + fr.rect.height + 0.01));
      for (const fr of L.frames) {
        if (own.includes(fr)) continue;
        for (let i = 1; i < a.points.length; i++) expect(segmentHitsRect(a.points[i - 1], a.points[i], fr.rect)).toBe(false);
      }
      if (a.label) expect(L.frames.some((fr) => fr.rect.x < a.labelAt!.x && fr.rect.x + fr.rect.width > a.labelAt!.x && fr.rect.y < a.labelAt!.y && fr.rect.y + fr.rect.height > a.labelAt!.y)).toBe(false);
    }
    const tablets = sheetLayout(doc, { ...defaults, platform: 'tablet' });
    expect(tablets.frames).toHaveLength(1);
    expect(tablets.arrows).toHaveLength(0);
  });

  it('notes only with --notes, and they grow the bounds', () => {
    const doc = fixture();
    expect(sheetLayout(doc, defaults).notes).toHaveLength(0);
    const withNotes = sheetLayout(doc, { ...defaults, notes: true });
    expect(withNotes.notes).toHaveLength(1);
    expect(withNotes.notes[0].target).toBeDefined();
  });

  it('a platform without frames is an error', () => {
    expect(() => sheetLayout(fixture(), { ...defaults, platform: 'desktop' })).toThrow(/no screen desktop/);
  });
});

describe('compare layout', () => {
  const frame = { width: 390, height: 844, name: 'Home', platform: 'phone' };
  it('scales the screenshot to the frame width keeping its aspect, panels side by side', () => {
    const L = compareLayout({ width: 780, height: 1688 }, frame, { scale: 1, max: 4096, overlay: undefined });
    expect(L.panels.map((p) => p.kind)).toEqual(['screenshot', 'frame']);
    expect(L.shotHeight).toBe(844);
    expect(L.panels[0].rect.width).toBe(L.panels[1].rect.width);
    expect(L.panels[1].rect.x).toBeGreaterThan(L.panels[0].rect.x + L.panels[0].rect.width);
    expect(L.panels[0].rect.y).toBe(L.panels[1].rect.y);
    expect(compareLayout({ width: 390, height: 2000 }, frame, { scale: 1, max: 4096, overlay: undefined }).shotHeight).toBeCloseTo(2000);
  });

  it('a taller screenshot makes the panels taller; overlay adds a third panel; max is respected', () => {
    const tall = compareLayout({ width: 390, height: 3000 }, frame, { scale: 1, max: 4096, overlay: 50 });
    expect(tall.panels.map((p) => p.kind)).toEqual(['screenshot', 'frame', 'overlay']);
    expect(tall.panels[0].rect.height).toBeCloseTo(3000 * tall.scale);
    const capped = compareLayout({ width: 390, height: 9000 }, frame, { scale: 2, max: 3000, overlay: 50 });
    expect(Math.max(capped.width, capped.height)).toBeLessThanOrEqual(3000);
  });
});

describe('image size', () => {
  it('reads PNG and JPEG headers and rejects others', () => {
    const png = new Uint8Array(32);
    new DataView(png.buffer).setUint32(0, 0x89504e47);
    new DataView(png.buffer).setUint32(16, 780);
    new DataView(png.buffer).setUint32(20, 1688);
    expect(imageSize(png)).toEqual({ width: 780, height: 1688, mime: 'image/png' });
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x06, 0x90, 0x03, 0x0c, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpg)).toEqual({ width: 780, height: 1680, mime: 'image/jpeg' });
    expect(imageSize(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });
});

describe('designer wf sheet / wf compare', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'designer-wfview-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await writeFile(join(dir, 'app.designer.json'), serializeProject(fixture()));
  });
  async function cli(...argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: dir });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }
  const size = (f: string) => {
    const b = readFileSync(join(dir, f));
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  };

  it('sheet writes one PNG within --max, default name <project>-sheet.png', async () => {
    const r = await cli('wf', 'sheet', 'app.designer.json', '--notes', '--max', '1200');
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/Wrote sheet of 5 frames, 3 flows, 1 note \(\d+×\d+ px, \d+%\) to app-sheet\.png/);
    const { width, height } = size('app-sheet.png');
    expect(Math.max(width, height)).toBeLessThanOrEqual(1200);
    expect(width).toBeGreaterThan(300);
  }, 60_000);

  it('sheet --platform filters; bad arguments exit 2', async () => {
    expect((await cli('wf', 'sheet', 'app.designer.json', '--platform', 'tablet', '-o', 't.png')).err).toMatch(/Wrote sheet of 1 frame, 0 flows/);
    expect((await cli('wf', 'sheet', 'app.designer.json', '--platform', 'desktop', '-o', 'd.png')).code).toBe(1);
    expect((await cli('wf', 'sheet', 'app.designer.json', '--scale', '-1')).code).toBe(2);
    expect((await cli('wf', 'sheet')).code).toBe(2);
    expect((await cli('wf', 'nope')).err).toMatch(/Unknown wf command/);
  }, 60_000);

  it('compare: screenshot + frame (+ overlay) in one PNG; errors name the problem', async () => {
    await cli('to-png', 'app.designer.json', '--screen', 'Home', '--size', '780', '-o', 'shot.png');
    const r = await cli('wf', 'compare', 'shot.png', 'app.designer.json', '--screen', 'Home', '--grid', '8', '--overlay', '50', '-o', 'cmp.png');
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/Wrote comparison of “Home” \(phone, 390 px wide\)/);
    const three = size('cmp.png');
    const two = await cli('wf', 'compare', 'shot.png', 'app.designer.json', '--screen', 'Home', '-o', 'cmp2.png');
    expect(two.code).toBe(0);
    expect(three.width).toBeGreaterThan(size('cmp2.png').width);
    expect((await cli('wf', 'compare', 'shot.png', 'app.designer.json', '-o', 'x.png')).code).toBe(2);
    const amb = await cli('wf', 'compare', 'shot.png', 'app.designer.json', '--screen', 'Settings');
    expect(amb.code).toBe(1);
    expect(amb.err).toMatch(/has 2 frames \(phone, tablet\); pick one with --platform/);
    expect((await cli('wf', 'compare', 'shot.png', 'app.designer.json', '--screen', 'Nope')).err).toMatch(/no screen “Nope”/);
    await writeFile(join(dir, 'bad.png'), 'not an image');
    expect((await cli('wf', 'compare', 'bad.png', 'app.designer.json', '--screen', 'Home', '-o', 'y.png')).err).toMatch(/PNG or JPEG/);
  }, 90_000);
});
