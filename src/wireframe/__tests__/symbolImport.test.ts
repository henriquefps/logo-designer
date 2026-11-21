// Importing shared components from another project (docs/wireframe-mode.md → Kits, import and paste):
// nested masters, dedup, re-import, master flows, paste between documents, New document from a kit.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { findNode, type DesignDocument, type GroupNode, type SceneNode, type ScreenNode } from '@/model';
import { validateDocument, serializeProject } from '@/io/projectFile';
import { copyNodes, parseClipboardPayload, pasteNodes, CLIPBOARD_MIME_PREFIX } from '@/store/clipboard';
import { useDocStore } from '@/store/useDocStore';
import { materializeDocument } from '../pipeline';
import { inSync, instancesOf, newSymbolInstance, symbolsOf } from '../symbols';
import { importSymbols, planSymbolImport, symbolSourceFor, withNested } from '../symbolImport';
import { newWireframeDocument } from '../commands';
import { card, miniKit, screensDoc } from './fixtures/miniKit';

const s = () => useDocStore.getState();
const byName = (doc: DesignDocument, name: string) => symbolsOf(doc).find((x) => x.name === name)!;
const nestedRef = (g: GroupNode): string | undefined => {
  for (const c of g.children) {
    if (c.type !== 'group') continue;
    if (c.symbol) return c.symbol.id;
    const r = nestedRef(c);
    if (r) return r;
  }
  return undefined;
};

describe('importSymbols', () => {
  it('copies every master with fresh ids, nested ones first, references pointing at the copies', () => {
    const kit = miniKit();
    const target = screensDoc(['Trips']);
    const r = importSymbols(target, kit.doc);
    expect(r.added.map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    const tCard = byName(target, 'Trip card');
    const tList = byName(target, 'Trip list');
    expect(tCard.id).not.toBe(kit.card);
    expect(tList.id).not.toBe(kit.list);
    expect(tCard.content.id).toBe(tCard.id);
    // Content keeps the master's own id space (master flows point into it).
    expect(tCard.content.children.map((c) => c.id)).toEqual(['c-img', 'c-title']);
    expect(nestedRef(tList.content)).toBe(tCard.id);
    expect(r.map.get(kit.card)).toBe(tCard.id);
    // The result is a valid project and an instance of the copy shows the nested card.
    const out = materializeDocument(target);
    expect(validateDocument(JSON.parse(serializeProject(out)), { warnings: [] }).wireframe?.symbols).toHaveLength(2);
    const inst = newSymbolInstance(tList, symbolsOf(out), { x: 0, y: 0 });
    expect(JSON.stringify(inst)).toContain('Lisbon');
  });

  it('brings the masters a chosen one nests (transitively)', () => {
    const kit = miniKit();
    expect(withNested(symbolsOf(kit.doc), [kit.list]).map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    const target = screensDoc(['A']);
    const r = importSymbols(target, kit.doc, { ids: [kit.list] });
    expect(r.added.map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    const only = screensDoc(['A']);
    expect(importSymbols(only, kit.doc, { ids: [kit.card] }).added.map((x) => x.name)).toEqual(['Trip card']);
  });

  it('re-importing the same kit is a no-op', () => {
    const kit = miniKit();
    const target = screensDoc(['Trips']);
    importSymbols(target, kit.doc);
    const before = structuredClone(target.wireframe);
    const again = importSymbols(target, kit.doc);
    expect(again.added).toEqual([]);
    expect(again.flows).toEqual([]);
    expect(again.reused.map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    expect(target.wireframe).toEqual(before);
  });

  it('reuses an equal master whatever its node ids; same name with other content gets "Name 2"', () => {
    const kit = miniKit();
    // The target built its own identical Trip card (other node ids): reused, not duplicated.
    const same = screensDoc(['A']);
    const content = structuredClone(byName(kit.doc, 'Trip card').content);
    content.children = content.children.map((c, i) => ({ ...c, id: `mine-${i}` }) as SceneNode);
    same.wireframe!.symbols = [{ id: 'mine', name: 'Trip card', content: { ...content, id: 'mine' } }];
    const r1 = importSymbols(same, kit.doc);
    expect(r1.reused).toEqual([{ source: kit.card, target: 'mine', name: 'Trip card' }]);
    expect(symbolsOf(same).map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    // Trip list refers to the reused master.
    expect(nestedRef(byName(same, 'Trip list').content)).toBe('mine');

    // A different Trip card: the import is "Trip card 2", and importing again changes nothing.
    const other = screensDoc(['A'], [card('x', 'Porto')]);
    other.wireframe!.symbols = [{ id: 'theirs', name: 'Trip card', content: { ...structuredClone(content), id: 'theirs', children: [card('x', 'Porto')] } }];
    const r2 = importSymbols(other, kit.doc);
    expect(r2.added.map((x) => x.name)).toEqual(['Trip card 2', 'Trip list']);
    expect(nestedRef(byName(other, 'Trip list').content)).toBe(byName(other, 'Trip card 2').id);
    const before = structuredClone(other.wireframe);
    expect(importSymbols(other, kit.doc).added).toEqual([]);
    expect(other.wireframe).toEqual(before);
  });

  it('keeps master flows whose screen exists in the target (by name), drops and counts the others', () => {
    const kit = miniKit();
    const target = screensDoc(['Home', 'trips']);
    const r = importSymbols(target, kit.doc);
    expect(r.droppedFlows).toBe(1); // Profile
    const tCard = byName(target, 'Trip card');
    const trips = target.wireframe!.screens.find((x) => x.name === 'trips')!;
    expect(target.wireframe!.flows).toEqual([{ id: expect.any(String), from: 'c-title', to: trips.id, symbol: tCard.id }]);
    // A project with none of those screens keeps no master flow.
    const bare = screensDoc([]);
    const r2 = importSymbols(bare, kit.doc);
    expect(r2.flows).toEqual([]);
    expect(r2.droppedFlows).toBe(2);
    expect(bare.wireframe!.flows).toBeUndefined();
  });

  it('plans without changing anything', () => {
    const kit = miniKit();
    const target = screensDoc(['A']);
    const before = structuredClone(target);
    expect(planSymbolImport(target, kit.doc).added).toHaveLength(2);
    expect(target).toEqual(before);
  });
});

describe('New document from a kit', () => {
  it('gets the kit masters only (no screens, no notes from the kit) plus its own first screen', () => {
    const kit = miniKit();
    const doc = newWireframeDocument(screensDoc([]), 'Mine', 'phone');
    importSymbols(doc, kit.doc);
    const out = materializeDocument(doc);
    expect(symbolsOf(out).map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    expect(out.wireframe!.screens).toHaveLength(1);
    expect(out.children).toHaveLength(1);
    expect(out.wireframe!.flows).toBeUndefined();
  });
});

describe('paste between documents', () => {
  const instanceOnScreen = (doc: DesignDocument, sym: string) => instancesOf(doc, sym)[0];
  beforeEach(() => s().load(screensDoc(['A'])));

  it('carries the masters and imports the missing ones, in one undo step; the paste stays an instance', () => {
    const kit = miniKit();
    s().load(kit.doc);
    const listInst = instanceOnScreen(s().doc, kit.list);
    copyNodes([listInst.id]);
    s().load(screensDoc(['Trips']));
    const [id] = pasteNodes();
    const doc = s().doc;
    expect(symbolsOf(doc).map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    const pasted = findNode(doc, id) as GroupNode;
    const tList = byName(doc, 'Trip list');
    expect(pasted.symbol).toEqual({ id: tList.id });
    expect(inSync(pasted, tList)).toBe(true);
    // The nested instance inside points at the imported card.
    expect(nestedRef(pasted)).toBe(byName(doc, 'Trip card').id);
    // The master flow to Trips came along (the target has a Trips screen).
    expect(doc.wireframe!.flows?.filter((f) => f.symbol)).toHaveLength(1);
    s().undo();
    expect(symbolsOf(s().doc)).toHaveLength(0);
    expect(findNode(s().doc, id)).toBeNull();
  });

  it('pasting again reuses the imported masters', () => {
    const kit = miniKit();
    s().load(kit.doc);
    copyNodes([instanceOnScreen(s().doc, kit.card).id]);
    s().load(screensDoc(['B']));
    const [a] = pasteNodes();
    const [b] = pasteNodes();
    const doc = s().doc;
    expect(symbolsOf(doc).map((x) => x.name)).toEqual(['Trip card']);
    expect((findNode(doc, a) as GroupNode).symbol).toEqual((findNode(doc, b) as GroupNode).symbol);
  });

  it('within the same document nothing changes (same master, no import)', () => {
    const kit = miniKit();
    s().load(kit.doc);
    const before = structuredClone(symbolsOf(s().doc));
    copyNodes([instanceOnScreen(s().doc, kit.card).id]);
    const [id] = pasteNodes();
    expect(symbolsOf(s().doc)).toEqual(before);
    expect((findNode(s().doc, id) as GroupNode).symbol).toEqual({ id: kit.card });
  });

  it('the system clipboard payload carries the masters too', () => {
    const kit = miniKit();
    const inst = instanceOnScreen(kit.doc, kit.list);
    const carried = symbolSourceFor(kit.doc, [inst])!;
    expect(carried.wireframe.symbols!.map((x) => x.name)).toEqual(['Trip card', 'Trip list']);
    expect(carried.wireframe.screens!.map((x) => x.name).sort()).toEqual(['Profile', 'Trips']);
    const text = CLIPBOARD_MIME_PREFIX + JSON.stringify({ nodes: [inst], flows: [], symbols: carried });
    const payload = parseClipboardPayload(text)!;
    s().load(screensDoc(['A']));
    const [id] = pasteNodes(payload.nodes, payload.flows, payload.symbols ?? null);
    const pasted = findNode(s().doc, id) as GroupNode;
    expect(pasted.symbol).toEqual({ id: byName(s().doc, 'Trip list').id });
  });

  it('without the masters (an old payload) a pasted instance becomes a plain group, as before', () => {
    const kit = miniKit();
    const inst = instanceOnScreen(kit.doc, kit.list);
    s().load(screensDoc(['A']));
    const [plainId] = pasteNodes([inst], []);
    const pasted = findNode(s().doc, plainId) as GroupNode;
    expect(pasted.symbol).toBeUndefined();
    expect(nestedRef(pasted)).toBeUndefined();
  });

  it('pasting a laid-out stack over a frame (the frame adopts it) does not write into frozen nodes', () => {
    // Regression: the adopt step moved the frozen pasted node into the frame; the layout step then wrote into it.
    s().load(screensDoc(['A'], [card('c')]));
    copyNodes(['c']);
    const [id] = pasteNodes();
    const frame = s().doc.children[0] as ScreenNode;
    expect(frame.children.some((n) => n.id === id)).toBe(true);
  });

  it('keeps instances pasted into a frame of the target in sync with the imported master', () => {
    const kit = miniKit();
    s().load(kit.doc);
    copyNodes([instanceOnScreen(s().doc, kit.card).id]);
    s().load(screensDoc(['A']));
    const [id] = pasteNodes();
    const frame = s().doc.children.find((n) => n.type === 'group' && (n as ScreenNode).screen) as ScreenNode;
    s().moveNodes([id], frame.id, 0);
    const moved = findNode(s().doc, id) as GroupNode;
    expect(inSync(moved, byName(s().doc, 'Trip card'))).toBe(true);
  });
});
