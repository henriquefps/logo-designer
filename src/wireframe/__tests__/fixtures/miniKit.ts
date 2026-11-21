// A small component kit for the import tests: screens Home and Trips; "Trip card" (image + heading in a
// card container) and "Trip list" (a stack holding a Trip card instance: a nested master). Trip card has
// two master flows: its title opens Trips, its image opens Profile (a screen the kit has, most targets don't).
import { createDocument, createGroup, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type SceneNode, type ScreenNode } from '@/model';
import { defaultScreenLayout } from '../../layout';
import { materializeDocument } from '../../pipeline';
import { addScreen } from '../../screens';
import { makeSymbol, newSymbolInstance, symbolsOf } from '../../symbols';

export const heading = (id: string, text: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'heading', props: { text, level: 'subheading' } } });
export const image = (id: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'image', props: {} } });
export const container = (id: string, layout: Partial<LayoutInfo> & { kind: LayoutInfo['kind'] }, children: SceneNode[] = []): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 0, padding: 0, align: 'stretch', ...layout } as LayoutInfo,
  children,
});
export const card = (id: string, title = 'Lisbon') => container(id, { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' }, [image(`${id}-img`), heading(`${id}-title`, title)]);

/** A copy as a file would load it: unfrozen and without shared objects (structuredClone keeps the pipeline's aliasing). */
const fresh = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A wireframe with phone screens `names` (frame ids F0, F1…), the first holding `content`. Not frozen. */
export function screensDoc(names: string[], content: SceneNode[] = [], name = 'W'): DesignDocument {
  const doc = createDocument({ name, wireframe: { screens: [] } });
  names.forEach((n, i) => {
    const id = addScreen(doc, { platform: 'phone', name: n, x: i * 500, y: 0, layout: defaultScreenLayout('phone') });
    const f = doc.children.find((c) => c.id === id) as ScreenNode;
    f.id = `F${i}`;
    if (i === 0) f.children = content;
  });
  // Unfrozen: tests change it in place.
  return fresh(materializeDocument(doc));
}

export function miniKit(): { doc: DesignDocument; card: string; list: string } {
  let doc = screensDoc(['Home', 'Trips', 'Profile'], [card('c')], 'Mini kit');
  const cardId = makeSymbol(doc, 'c', 'Trip card')!;
  doc = fresh(materializeDocument(doc));
  const inst = newSymbolInstance(symbolsOf(doc)[0], symbolsOf(doc), { x: 0, y: 0 });
  const list = container('l', { kind: 'vstack', gap: 12 }, [heading('l-head', 'Upcoming'), inst]);
  (doc.children[0] as ScreenNode).children.push(list);
  doc = fresh(materializeDocument(doc));
  const listId = makeSymbol(doc, 'l', 'Trip list')!;
  doc = fresh(materializeDocument(doc));
  const [home, trips, profile] = doc.wireframe!.screens;
  void home;
  doc.wireframe!.flows = [
    { id: 'f-title', from: 'c-title', to: trips.id, symbol: cardId },
    { id: 'f-img', from: 'c-img', to: profile.id, symbol: cardId, label: 'Profile' },
  ];
  return { doc: fresh(materializeDocument(doc)), card: cardId, list: listId };
}

/** The mini kit as a fictional component kit project: masters "Acme · Trip card" and "Acme · Trip list" (nesting it), `wireframe.kit` on. */
export function acmeKit(): DesignDocument {
  const { doc } = miniKit();
  doc.name = 'Acme kit';
  for (const s of doc.wireframe!.symbols!) s.name = `Acme · ${s.name}`;
  doc.wireframe!.kit = true;
  return doc;
}
