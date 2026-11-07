// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { apply, boundsIn, fromTransform, type GroupNode, type PathNode, type TextNode } from '@/model';
import { loadDocument, loadProjectList } from '@/store/persistence';
import { convertLegacyProject, LEGACY_STORAGE_KEY, readLegacyProjects, type IconRenderer } from './logogo';
import { migrateLogoGoOnce, MIGRATED_FLAG } from './migrate';

const lucideStar: IconRenderer = async ({ library, name, color }) =>
  library === 'lucide' && name === 'Star'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M2 2h20v20H2z"/></svg>`
    : null;

const base = { x: 256, y: 256, rotation: 0, opacity: 100, flipH: false, flipV: false, locked: false };
const project = {
  id: 'p1',
  name: 'Old logo',
  createdAt: 1000,
  updatedAt: 2000,
  canvasSettings: { bgType: 'gradient', bgColor: '#fff', bgGradientStart: '#111111', bgGradientEnd: '#222222', bgGradientAngle: 90, bgShape: 'rounded' },
  elements: [
    { ...base, id: 'i', type: 'icon', iconType: 'lucide', name: 'Star', size: 96, color: '#ff0000' },
    { ...base, id: 't', type: 'text', text: 'ACME', size: 40, color: '#00ff00', fontFamily: 'Space Grotesk Variable', fontWeight: '700', y: 400 },
    { ...base, id: 'r', type: 'shape', shape: 'rectangle', width: 100, height: 50, fill: '#0000ff', stroke: '#000000', strokeWidth: 2, cornerRadius: 8, opacity: 50, flipH: true },
    { ...base, id: 'p', type: 'shape', shape: 'path', width: 10, height: 10, fill: '#123456', stroke: '#000000', strokeWidth: 3, points: [{ x: 0, y: 0 }, { x: 10, y: 0, handleInX: -2, handleInY: 1 }], closed: false },
    { ...base, id: 'b', type: 'shape', shape: 'path', width: 10, height: 10, fill: '#123456', stroke: '', strokeWidth: 0, pathData: 'M0 0H10V10Z' },
    { ...base, id: 'img', type: 'image', src: 'data:image/png;base64,AAAA', size: 100, naturalWidth: 200, naturalHeight: 100 },
    { ...base, id: 'x', type: 'icon', iconType: 'phosphor', name: 'Missing', size: 64, color: '#000' },
    { id: 'junk' },
  ],
};
const envelope = JSON.stringify({ state: { projects: { p1: project }, projectOrder: ['p1'], activeProjectId: 'p1' }, version: 1 });

describe('LogoGo migration', () => {
  it('reads the persist envelope and tolerates junk', () => {
    expect(readLegacyProjects(envelope)).toHaveLength(1);
    expect(readLegacyProjects('not json')).toEqual([]);
    expect(readLegacyProjects(null)).toEqual([]);
    expect(readLegacyProjects('{"state":{"projects":[{"name":"A"}]}}')[0]).toMatchObject({ name: 'A', elements: [] });
  });

  it('maps background, icons, text, shapes and images', async () => {
    const { doc, converted, skipped } = await convertLegacyProject(readLegacyProjects(envelope)[0], lucideStar);
    expect(converted).toBe(6);
    expect(skipped).toBe(2);
    expect(doc.artboard).toEqual({ width: 512, height: 512, background: { kind: 'none' } });
    const [bg, icon, txt, rect, open, closed, img] = doc.children;
    expect(bg).toMatchObject({ type: 'rect', name: 'Background', locked: true, radius: 64, width: 512, fill: { kind: 'linear', angle: 90 } });

    // Icon: 24-unit viewBox scaled to 96 px and centered on (256, 256).
    const g = icon as GroupNode;
    expect(g.type).toBe('group');
    const box = boundsIn(g, fromTransform(g.transform))!;
    expect(box.x).toBeCloseTo(256 - 40);
    expect(box.width).toBeCloseTo(80); // path spans 2..22 of 24 units
    expect((g.children[0] as PathNode).stroke.paint).toEqual({ kind: 'solid', color: '#ff0000' });

    // Text centered vertically on y = 400.
    const t = txt as TextNode;
    expect(t).toMatchObject({ text: 'ACME', fontWeight: 700, fontFamily: 'Space Grotesk Variable', align: 'center', fontSize: 40 });
    const mid = apply(fromTransform(t.transform), { x: 0, y: (40 * 1.2) / 2 });
    expect(mid.y).toBeCloseTo(400);

    expect(rect).toMatchObject({ type: 'rect', width: 100, height: 50, radius: 8, opacity: 0.5, transform: { scaleX: -1 } });
    expect((open as PathNode).fill).toEqual({ kind: 'none' });
    expect((open as PathNode).subpaths[0].points[1].in).toEqual({ x: 8, y: 1 });
    expect((closed as PathNode).fill).toEqual({ kind: 'solid', color: '#123456' });
    expect((closed as PathNode).stroke.paint.kind).toBe('none');
    expect(img).toMatchObject({ type: 'image', width: 100, height: 50 });
  });

  it('runs once and stores the projects in IndexedDB', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, envelope);
    const summary = await migrateLogoGoOnce(lucideStar);
    expect(summary).toMatchObject({ projects: 1, failed: 0, skippedElements: 2 });
    expect(localStorage.getItem(MIGRATED_FLAG)).toBeTruthy();
    const list = await loadProjectList();
    const meta = list.find((m) => m.name === 'Old logo')!;
    expect(meta).toBeDefined();
    expect((await loadDocument(meta.id))!.children).toHaveLength(7);
    expect(await migrateLogoGoOnce(lucideStar)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(envelope); // old data untouched
  });
});

describe('renderLibraryIcon', () => {
  it('renders real lucide and phosphor icons into importable SVG', async () => {
    const { renderLibraryIcon } = await import('./renderIcon');
    for (const library of ['lucide', 'phosphor'] as const) {
      const { doc } = await convertLegacyProject(
        { id: 'a', name: 'a', createdAt: 0, updatedAt: 0, canvasSettings: { bgType: 'transparent' }, elements: [{ ...base, type: 'icon', iconType: library, name: 'Star', size: 64, color: '#336699', weight: 'fill' }] },
        renderLibraryIcon,
      );
      const g = doc.children[0] as GroupNode;
      expect(g.type).toBe('group');
      const box = boundsIn(g, fromTransform(g.transform))!;
      expect(box.width).toBeGreaterThan(40);
      expect(box.width).toBeLessThanOrEqual(64.01);
      expect(Math.abs(box.x + box.width / 2 - 256)).toBeLessThan(4);
    }
  });
});
