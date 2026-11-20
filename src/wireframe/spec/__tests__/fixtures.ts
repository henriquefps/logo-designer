// Wireframe projects built the way the app builds them (addScreen, library instances with all their
// props, stacks, Make component, Duplicate as…, flows, notes), for the spec round-trip tests.
import { current, produce } from 'immer';
import { createDocument, createGroup, createRect, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type LayoutItemInfo, type SceneNode, type ScreenNode } from '@/model';
import { getComponent } from '../../library/registry';
import { defaultProps } from '../../library/types';
import { materializeDocument } from '../../pipeline';
import { addScreen, duplicateScreenAs } from '../../screens';
import { makeSymbol, newSymbolInstance, symbolsOf } from '../../symbols';
import { addFlow, setScreenStatus } from '../../flows';
import { addNote } from '../../notes';
import { desktopScreen } from '../../library/__tests__/desktopScreen';

export const inst = (id: string, kind: string, props: Record<string, unknown> = {}, item?: LayoutItemInfo): ComponentNode => ({
  ...createGroup({ name: getComponent(kind)!.label }),
  id,
  component: { kind, props: { ...defaultProps(getComponent(kind)!), ...props } },
  ...(item ? { layoutItem: item } : {}),
});

const NAMES: Record<string, string> = { vstack: 'Vertical stack', hstack: 'Horizontal stack', grid: 'Grid' };
export const stack = (id: string, layout: Partial<LayoutInfo> & Pick<LayoutInfo, 'kind'>, children: SceneNode[], item?: LayoutItemInfo, name?: string): GroupNode => {
  const base = layout.kind === 'hstack' ? { gap: 8, padding: 0, align: 'center' as const } : layout.kind === 'grid' ? { gap: 12, padding: 0, align: 'stretch' as const, columns: 2 } : { gap: 12, padding: 0, align: 'stretch' as const };
  return { ...createGroup({ name: name ?? NAMES[layout.kind] }), id, layout: { ...base, ...layout }, children, ...(item ? { layoutItem: item } : {}) };
};

function frame(doc: DesignDocument, id: string): ScreenNode {
  return doc.children.find((n) => n.id === id) as ScreenNode;
}

function screen(doc: DesignDocument, o: { id: string; name: string; platform?: 'phone' | 'tablet' | 'desktop'; x: number; layout?: LayoutInfo | null }, children: SceneNode[]): ScreenNode {
  const fid = addScreen(doc, { platform: o.platform ?? 'phone', name: o.name, x: o.x, y: 0, ...(o.layout !== undefined ? { layout: o.layout } : {}) });
  const f = frame(doc, fid);
  f.id = o.id;
  f.children = children;
  return f;
}

/** Hoard-like Settings (top bar, section headers, rows with values / toggles, radio group, button) + Language, a flow and notes. */
export function settingsProject(): DesignDocument {
  let doc = createDocument({ name: 'Hoard', artboard: { width: 1024, height: 1024, background: { kind: 'none' } }, wireframe: { screens: [] } });
  screen(doc, { id: 'F-settings', name: 'Settings', x: 0 }, [
    inst('bar', 'top-app-bar', { title: 'Settings', leading: 'none', actions: 0 }),
    inst('sec-general', 'section-header', { label: 'GENERAL' }),
    inst('row-language', 'list-row', { title: 'Language', trailing: 'value', value: 'English' }),
    inst('row-theme', 'list-row', { title: 'Theme', trailing: 'value', value: 'System' }),
    inst('sec-sync', 'section-header', { label: 'SYNC' }),
    inst('row-wifi', 'list-row', { title: 'Wi-Fi only', subtitle: 'Saves mobile data', trailing: 'toggle', checked: true }),
    inst('quality', 'radio-group', { label: 'Upload quality', options: ['Original', 'High', 'Saver'], selected: 2 }),
    inst('save', 'button', { label: 'Sign out', variant: 'secondary' }),
    inst('nav', 'bottom-navigation', { labels: ['Gallery', 'Albums', 'Settings'], selected: 3 }, { position: 'pinned-bottom' }),
  ]);
  screen(doc, { id: 'F-language', name: 'Language', x: 500 }, [
    inst('lang-bar', 'top-app-bar', { title: 'Language' }),
    stack('lang-list', { kind: 'vstack', gap: 0 }, [inst('lang-en', 'list-row', { title: 'English', trailing: 'checkbox', checked: true })], { width: 'fill' }),
  ]);
  doc = materializeDocument(doc);
  doc = produce(doc, (d) => {
    const lang = d.wireframe!.screens.find((s) => s.name === 'Language')!;
    addFlow(d, 'row-language', lang.id, 'Pick language');
    setScreenStatus(d, d.wireframe!.screens[0].id, 'current');
    setScreenStatus(d, lang.id, 'new');
  });
  doc = materializeDocument(doc);
  doc = produce(doc, (d) => {
    addNote(d, { text: 'Opens the system language list on Android 13+', target: 'row-language' });
    addNote(d, { text: 'Free note on the canvas', x: -300, y: 40 });
  });
  return materializeDocument(doc);
}

/** Every container kind, styles, repeat, nesting, fixed sizes, pinned / free placement, a free frame, plain shapes. */
export function containersProject(): DesignDocument {
  let doc = createDocument({ name: 'Containers', wireframe: { screens: [] } });
  screen(doc, { id: 'F-home', name: 'Home', x: 0 }, [
    inst('title', 'heading', { text: 'Trips', level: 'title' }),
    stack('chips', { kind: 'hstack', gap: 8 }, [inst('c1', 'chip', { label: 'All', selected: true }), inst('c2', 'chip', { label: 'Saved' })]),
    stack('cards', { kind: 'vstack', gap: 16, repeat: { count: 3 } }, [
      stack('card', { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' }, [inst('card-img', 'image', { ratio: '4:3' }), inst('card-title', 'heading', { text: 'Lisbon', level: 'subheading' })], undefined, 'Card container'),
    ]),
    stack('gallery', { kind: 'grid', columns: 3, gap: 4, style: 'filled', radius: 'large', padding: 8 }, [inst('g1', 'image', { ratio: '1:1' }), inst('g2', 'image', { ratio: '1:1' })], { width: 300 }),
    stack('nested', { kind: 'vstack', padding: 12, align: 'center' }, [stack('inner', { kind: 'hstack', align: 'end' }, [inst('ok', 'button', { label: 'OK' }), inst('cancel', 'button', { label: 'Cancel', variant: 'text' })])], undefined, 'Actions'),
    inst('fixed', 'text', { text: 'Fixed width text' }, { width: 200, bleed: true }),
    inst('hidden-row', 'list-row', { title: 'Hidden' }),
    inst('fab', 'fab', { label: 'New trip' }),
    inst('nav', 'bottom-navigation', {}, { position: 'pinned-bottom' }),
    stack('free-card', { kind: 'vstack', padding: 16, style: 'outline-filled', size: { width: 240, height: 120 } }, [inst('free-text', 'text', { text: 'Free card', size: 'small' })], { position: 'free' }),
  ]);
  screen(doc, { id: 'F-free', name: 'Free screen', x: 500, layout: null }, [
    { ...inst('free-heading', 'heading', { text: 'No stack here' }), transform: { x: 24, y: 40, rotation: 0, scaleX: 1, scaleY: 1 } },
    { ...createGroup({ name: 'Logo group' }), id: 'plain-group', transform: { x: 40, y: 200, rotation: 0, scaleX: 1, scaleY: 1 }, children: [createRect({ id: 'logo-rect', width: 60, height: 40, transform: { x: 30, y: 20 } })] },
  ]);
  doc = materializeDocument(doc);
  // A FAB placed like the library does (free, bottom right), the hidden row, a canvas shape.
  doc = produce(doc, (d) => {
    const home = d.children.find((c) => c.id === 'F-home') as ScreenNode;
    const fab = home.children.find((c) => c.id === 'fab') as ComponentNode;
    fab.layoutItem = { position: 'free' };
    fab.transform.x = 250;
    fab.transform.y = 760;
    const hidden = home.children.find((c) => c.id === 'hidden-row')!;
    hidden.visible = false;
    hidden.locked = true;
    d.children.push(createRect({ id: 'canvas-rect', name: 'Sticker', width: 80, height: 80, transform: { x: -200, y: 300 } }));
  });
  return materializeDocument(doc);
}

/** Shared components: a top bar on two screens, a card in a repeat, a master containing another, a flow from inside an instance. */
export function sharedProject(): DesignDocument {
  let doc = createDocument({ name: 'Shared', wireframe: { screens: [] } });
  screen(doc, { id: 'A', name: 'Home', x: 0 }, [
    stack('topbar', { kind: 'hstack', padding: 12, gap: 8 }, [inst('tb-title', 'heading', { text: 'Hoard', level: 'subheading' }), inst('tb-icon', 'icon', {})], { bleed: true }),
    stack('trips', { kind: 'vstack', gap: 12, repeat: { count: 2 } }, [
      stack('trip', { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' }, [inst('trip-img', 'image', {}), inst('trip-title', 'heading', { text: 'Lisbon', level: 'subheading' })]),
    ]),
  ]);
  screen(doc, { id: 'B', name: 'Trips', x: 500 }, []);
  doc = materializeDocument(doc);
  let top = '';
  let trip = '';
  doc = produce(doc, (d) => void (top = makeSymbol(d, 'topbar', 'Top bar')!));
  doc = materializeDocument(doc);
  doc = produce(doc, (d) => void (trip = makeSymbol(d, 'trip', 'Trip card')!));
  doc = materializeDocument(doc);
  // Trips: the top bar again, and a "Trip list" made of a heading + a Trip card instance (nested master).
  doc = produce(doc, (d) => {
    const symbols = symbolsOf(current(d));
    const b = d.children.find((c) => c.id === 'B') as ScreenNode;
    const topInst = { ...newSymbolInstance(symbols.find((s) => s.id === top)!, symbols, { x: 0, y: 0 }), layoutItem: { bleed: true } };
    const cardInst = newSymbolInstance(symbols.find((s) => s.id === trip)!, symbols, { x: 0, y: 0 });
    b.children.push(topInst as never, stack('triplist', { kind: 'vstack', gap: 8 }, [inst('tl-title', 'heading', { text: 'Upcoming' }), cardInst]) as never);
  });
  doc = materializeDocument(doc);
  doc = produce(doc, (d) => void makeSymbol(d, 'triplist', 'Trip list'));
  doc = materializeDocument(doc);
  // A flow from the title inside Home's top bar instance, and one from the instance itself.
  doc = produce(doc, (d) => {
    const trips = d.wireframe!.screens.find((s) => s.name === 'Trips')!;
    const home = d.wireframe!.screens.find((s) => s.name === 'Home')!;
    addFlow(d, 'topbar~s~tb-title', trips.id);
    const b = d.children.find((c) => c.id === 'B') as ScreenNode;
    addFlow(d, b.children[0].id, home.id);
  });
  return materializeDocument(doc);
}

/** Settings with a phone and a tablet variant (Duplicate as…), plus the desktop files screen. */
export function variantsProject(): DesignDocument {
  let doc = settingsProject();
  doc = produce(doc, (d) => void duplicateScreenAs(d, 'F-settings', 'tablet'));
  doc = materializeDocument(doc);
  const desk = desktopScreen();
  doc = produce(doc, (d) => {
    d.wireframe!.screens.push(...structuredClone(desk.wireframe!.screens));
    const f = structuredClone(desk.children[0]) as ScreenNode;
    f.transform.y = 1400;
    d.children.push(f as never);
  });
  return materializeDocument(doc);
}
