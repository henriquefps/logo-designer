import { describe, expect, it } from 'vitest';
import { createDocument, createGroup, createRect, isScreenNode, type DesignDocument, type ScreenNode } from '@/model';
import { materializeDocument } from '../pipeline';

/** The pipeline result (on a copy: immer freezes what it returns, including shared parts of the input). */
const mat = (doc: DesignDocument) => materializeDocument(structuredClone(doc));
import { addScreen, contentBottom, duplicateScreenAs, freePlatforms, screenHeight, screenSlug, variantsOf, findFrames } from '../screens';

const wireframe = (): DesignDocument => createDocument({ name: 'W', wireframe: { screens: [] } });
const frame = (doc: DesignDocument, id: string) => doc.children.find((n) => n.id === id) as ScreenNode;

describe('screen height', () => {
  it('is the platform minimum when the screen is empty or short', () => {
    const doc = wireframe();
    const phone = addScreen(doc, { platform: 'phone', name: 'Home' });
    const tablet = addScreen(doc, { platform: 'tablet' });
    const desktop = addScreen(doc, { platform: 'desktop' });
    const out = mat(doc);
    expect(frame(out, phone).screen).toMatchObject({ width: 390, height: 844 });
    expect(frame(out, tablet).screen).toMatchObject({ width: 820, height: 1180 });
    expect(frame(out, desktop).screen).toMatchObject({ width: 1440, height: 900 });
    // A short child does not change it.
    frame(doc, phone).children.push(createRect({ width: 100, height: 100, transform: { x: 50, y: 50 } }));
    expect(frame(mat(doc), phone).screen.height).toBe(844);
  });

  it('grows with the content (and shrinks back, never below the minimum)', () => {
    const doc = wireframe();
    const id = addScreen(doc, { platform: 'phone' });
    // A 100-tall rect centred at y = 1000 reaches y = 1050.
    frame(doc, id).children.push(createRect({ width: 100, height: 100, transform: { x: 50, y: 1000 } }));
    expect(contentBottom(frame(doc, id))).toBe(1050);
    expect(frame(mat(doc), id).screen.height).toBe(1050);
    // Hidden content does not count.
    frame(doc, id).children[0].visible = false;
    expect(frame(mat(doc), id).screen.height).toBe(844);
  });

  it('nested content counts with its group transform', () => {
    const doc = wireframe();
    const id = addScreen(doc, { platform: 'phone' });
    const g = createGroup({ transform: { x: 0, y: 900 }, children: [createRect({ width: 10, height: 40, transform: { x: 5, y: 20 } })] });
    frame(doc, id).children.push(g);
    expect(screenHeight(frame(doc, id))).toBe(940);
  });

  it('a frame with a layout keeps the height the layout step wrote (minimum enforced)', () => {
    const doc = wireframe();
    const id = addScreen(doc, { platform: 'phone' });
    const f = frame(doc, id);
    f.layout = { kind: 'vstack', gap: 0, padding: 16, align: 'stretch' };
    f.screen.height = 1500;
    expect(screenHeight(f)).toBe(1500);
    f.screen.height = 100;
    expect(screenHeight(f)).toBe(844);
  });
});

describe('logical screens and variants', () => {
  it('a logical screen has at most one frame per platform; only one is required', () => {
    const doc = wireframe();
    const phone = addScreen(doc, { platform: 'phone', name: 'Settings' });
    const screenId = frame(doc, phone).screen.screenId;
    expect(doc.wireframe!.screens).toEqual([{ id: screenId, name: 'Settings' }]);
    expect(freePlatforms(doc, screenId)).toEqual(['tablet', 'desktop']);
    expect(() => addScreen(doc, { platform: 'phone', screenId })).toThrow(/already has a phone frame/);
    addScreen(doc, { platform: 'desktop', screenId });
    expect(variantsOf(doc, screenId).map((f) => f.screen.platform)).toEqual(['phone', 'desktop']);
    expect(freePlatforms(doc, screenId)).toEqual(['tablet']);
  });

  it('Duplicate as… copies the content into a variant next to the source, once per platform', () => {
    const doc = wireframe();
    const phone = addScreen(doc, { platform: 'phone', name: 'Gallery', x: 0, y: 0 });
    frame(doc, phone).children.push(createRect({ name: 'Card', width: 100, height: 100, transform: { x: 60, y: 60 } }));
    // Something in the way to the right: the variant goes past it.
    doc.children.push(createRect({ width: 200, height: 200, transform: { x: 600, y: 100 } }));
    const tablet = duplicateScreenAs(doc, phone, 'tablet')!;
    const t = frame(doc, tablet);
    expect(t.screen).toMatchObject({ platform: 'tablet', width: 820, screenId: frame(doc, phone).screen.screenId });
    expect(t.transform.x).toBeGreaterThanOrEqual(700 + 80);
    expect(t.transform.y).toBe(0);
    expect(t.children[0]).toMatchObject({ name: 'Card' });
    expect(t.children[0].id).not.toBe(frame(doc, phone).children[0].id);
    expect(duplicateScreenAs(doc, phone, 'tablet')).toBeNull();
    expect(duplicateScreenAs(doc, tablet, 'phone')).toBeNull();
    const out = mat(doc);
    expect(out.wireframe!.screens).toHaveLength(1);
    expect(frame(out, tablet).screen.height).toBe(1180);
  });

  it('a plain duplicate of a frame (same platform) becomes its own logical screen', () => {
    const doc = wireframe();
    const a = addScreen(doc, { platform: 'phone', name: 'Home' });
    const copy = structuredClone(frame(doc, a));
    copy.id = 'copy';
    doc.children.push(copy);
    const out = mat(doc);
    expect(out.wireframe!.screens.map((s) => s.name)).toEqual(['Home', 'Home copy']);
    expect(frame(out, 'copy').screen.screenId).not.toBe(frame(out, a).screen.screenId);
    expect(frame(out, 'copy').name).toBe('Home copy');
  });

  it('frames with unknown screen ids get a logical screen; screens without frames are removed', () => {
    const doc = wireframe();
    const a = addScreen(doc, { platform: 'phone', name: 'Kept' });
    doc.wireframe!.screens.push({ id: 'orphan', name: 'Orphan' });
    frame(doc, a).screen.screenId = 'pasted';
    const out = mat(doc);
    expect(out.wireframe!.screens).toEqual([{ id: 'pasted', name: 'Kept' }]);
  });

  it('variants carry the logical name', () => {
    const doc = wireframe();
    const a = addScreen(doc, { platform: 'phone', name: 'Profile' });
    const b = duplicateScreenAs(doc, a, 'desktop')!;
    doc.wireframe!.screens[0].name = 'Account';
    const out = mat(doc);
    expect([frame(out, a).name, frame(out, b).name]).toEqual(['Account', 'Account']);
  });

  it('screens are normalized: no rotation, scale folded into the width', () => {
    const doc = wireframe();
    const a = addScreen(doc, { platform: 'phone' });
    frame(doc, a).transform = { x: 10, y: 20, rotation: 30, scaleX: 2, scaleY: 1 };
    const out = frame(mat(doc), a);
    expect(out.transform).toEqual({ x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(out.screen.width).toBe(780);
  });

  it('finds frames by name, slug and platform', () => {
    const doc = wireframe();
    const a = addScreen(doc, { platform: 'phone', name: 'Sign in / Up' });
    duplicateScreenAs(doc, a, 'desktop');
    expect(screenSlug('Sign in / Up')).toBe('sign-in-up');
    expect(screenSlug('Configurações')).toBe('configuracoes');
    expect(findFrames(doc, 'sign in / up')).toHaveLength(2);
    expect(findFrames(doc, 'sign-in-up', 'desktop')).toHaveLength(1);
    expect(findFrames(doc).every(isScreenNode)).toBe(true);
  });
});
