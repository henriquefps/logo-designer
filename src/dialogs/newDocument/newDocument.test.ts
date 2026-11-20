import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRect, isScreenNode } from '@/model';
import { loadDocument } from '@/store/persistence';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { createDocument } from './create';
import { defaultName, defaultOptions, DESIGN_MODES, firstStep, freeSize, MAX_SIDE, moveFocus, pickMode } from './modes';

describe('New document: step logic', () => {
  it('offers the three modes, the free project last', () => {
    expect(DESIGN_MODES.map((m) => m.id)).toEqual(['icon', 'wireframe', 'free']);
    for (const m of DESIGN_MODES) expect(m.description.length).toBeGreaterThan(20);
  });

  it('starts at the mode cards; picking a mode opens its options with defaults', () => {
    expect(firstStep()).toEqual({ step: 'mode' });
    expect(pickMode('icon')).toEqual({ step: 'options', options: { mode: 'icon', name: '', preset: 'app-icon', shape: 'auto', colour: 'one-colour' } });
    expect(pickMode('wireframe')).toEqual({ step: 'options', options: { mode: 'wireframe', name: '', platform: 'phone' } });
    expect(pickMode('free')).toEqual({ step: 'options', options: { mode: 'free', name: '', size: 'logo', width: 1024, height: 1024 } });
  });

  it('moves between the cards with arrows, Home and End, without wrapping', () => {
    expect(moveFocus(0, 'ArrowRight')).toBe(1);
    expect(moveFocus(1, 'ArrowDown')).toBe(2);
    expect(moveFocus(2, 'ArrowRight')).toBe(2);
    expect(moveFocus(2, 'ArrowLeft')).toBe(1);
    expect(moveFocus(0, 'ArrowUp')).toBe(0);
    expect(moveFocus(1, 'Home')).toBe(0);
    expect(moveFocus(0, 'End')).toBe(2);
    expect(moveFocus(0, 'Enter')).toBeNull();
    expect(moveFocus(0, 'a')).toBeNull();
  });

  it('resolves the free size: a preset, or a custom size rounded and clamped', () => {
    expect(freeSize({ ...defaultOptions('free'), size: 'og' })).toEqual({ width: 1200, height: 630 });
    expect(freeSize({ ...defaultOptions('free'), size: 'custom', width: 640.6, height: 0 })).toEqual({ width: 641, height: 1 });
    expect(freeSize({ ...defaultOptions('free'), size: 'custom', width: 1e9, height: NaN })).toEqual({ width: MAX_SIDE, height: 1 });
  });

  it('names an unnamed project after its mode', () => {
    expect(defaultName(defaultOptions('free'))).toBe('Untitled');
    expect(defaultName(defaultOptions('wireframe'))).toBe('Wireframe');
    expect(defaultName(defaultOptions('icon'))).toBe('App icon');
    expect(defaultName({ ...defaultOptions('icon'), preset: 'ios' })).toBe('iOS');
  });
});

describe('New document: the document each mode creates', () => {
  const doc = () => useDocStore.getState().doc;
  beforeEach(async () => {
    await useProjectsStore.getState().init();
    // A project with content, so each create makes a new project instead of reusing the empty one.
    useDocStore.getState().addNodes([createRect()]);
  });

  it('App icon with the defaults: the app-icon preset, 128 square, shape auto, default colours', async () => {
    const before = useProjectsStore.getState().activeId;
    await createDocument(defaultOptions('icon'));
    expect(useProjectsStore.getState().activeId).not.toBe(before);
    expect(doc().name).toBe('App icon');
    expect(doc().artboard).toMatchObject({ width: 128, height: 128 });
    expect(doc().icon).toEqual({ preset: 'app-icon', shape: 'auto' });
    expect(doc().wireframe).toBeUndefined();
    expect((await loadDocument(doc().id))!.icon?.preset).toBe('app-icon');
  });

  it('App icon with options: preset, shape, tile and full colour are kept', async () => {
    await createDocument({ ...defaultOptions('icon'), name: 'Logo mark', preset: 'android-adaptive', shape: 'circle', tile: '#123456', colour: 'full-colour', glyph: '#ff0000' });
    expect(doc().name).toBe('Logo mark');
    expect(doc().artboard).toMatchObject({ width: 108, height: 108 });
    // Full colour ignores the one-colour glyph.
    expect(doc().icon).toEqual({ preset: 'android-adaptive', shape: 'circle', tile: '#123456', colour: 'full-colour' });
  });

  it('Wireframe with the defaults: one phone screen, no icon', async () => {
    await createDocument(defaultOptions('wireframe'));
    expect(doc().name).toBe('Wireframe');
    expect(doc().icon).toBeUndefined();
    expect(doc().wireframe?.screens).toHaveLength(1);
    const frames = doc().children.filter(isScreenNode);
    expect(frames.map((f) => f.screen.platform)).toEqual(['phone']);
  });

  it('Wireframe with a name and a desktop first screen', async () => {
    await createDocument({ ...defaultOptions('wireframe'), name: 'Checkout', platform: 'desktop' });
    expect(doc().name).toBe('Checkout');
    expect(doc().children.filter(isScreenNode).map((f) => f.screen.platform)).toEqual(['desktop']);
  });

  it('Free project: the preset or custom artboard, no icon, no wireframe', async () => {
    await createDocument(defaultOptions('free'));
    expect(doc().name).toBe('Untitled');
    expect(doc().artboard).toMatchObject({ width: 1024, height: 1024 });
    expect(doc().icon).toBeUndefined();
    expect(doc().wireframe).toBeUndefined();

    useDocStore.getState().addNodes([createRect()]);
    await createDocument({ ...defaultOptions('free'), name: 'Poster', size: 'custom', width: 800, height: 600 });
    expect(doc().name).toBe('Poster');
    expect(doc().artboard).toMatchObject({ width: 800, height: 600 });
  });

  it('reuses the still-empty document instead of leaving an empty project behind', async () => {
    await createDocument(defaultOptions('free')); // empty and untouched now
    const count = useProjectsStore.getState().projects.length;
    const id = doc().id;
    await createDocument({ ...defaultOptions('free'), size: 'og', name: 'Card' });
    expect(useProjectsStore.getState().projects).toHaveLength(count);
    expect(doc().id).toBe(id);
    expect(doc().artboard).toMatchObject({ width: 1200, height: 630 });
    expect(useProjectsStore.getState().projects.find((p) => p.id === id)!.name).toBe('Card');
  });
});

describe('New document: reusing an empty document of another mode', () => {
  const doc = () => useDocStore.getState().doc;
  it('an empty icon becomes a plain free project (no icon marker, default name)', async () => {
    await useProjectsStore.getState().init();
    useDocStore.getState().addNodes([createRect()]);
    await createDocument({ ...defaultOptions('icon'), name: 'Weather', preset: 'ios' });
    const id = doc().id;
    await createDocument(defaultOptions('free'));
    expect(doc().id).toBe(id);
    expect(doc().icon).toBeUndefined();
    expect(doc().name).toBe('Untitled');
    expect(doc().artboard).toMatchObject({ width: 1024, height: 1024 });
    expect((await loadDocument(id))!.icon).toBeUndefined();
  });

  it('an empty icon becomes a wireframe named Wireframe', async () => {
    await createDocument(defaultOptions('icon'));
    await createDocument(defaultOptions('wireframe'));
    expect(doc().icon).toBeUndefined();
    expect(doc().name).toBe('Wireframe');
    expect(doc().wireframe?.screens).toHaveLength(1);
  });
});
