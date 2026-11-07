import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createEllipse, createGroup, createRect, findNode, worldBounds } from '@/model';
import { copyNodes, cutNodes, pasteNodes } from '../clipboard';
import { HISTORY_LIMIT, useDocStore } from '../useDocStore';

const s = () => useDocStore.getState();
const ids = () => s().doc.children.map((c) => c.id);

beforeEach(() => s().load(createDocument()));

describe('useDocStore', () => {
  it('adds, updates and undoes/redoes', () => {
    const r = createRect();
    s().addNodes([r]);
    s().updateNode(r.id, { transform: { x: 50 } });
    expect(s().findNode(r.id)!.transform.x).toBe(50);
    s().undo();
    expect(s().findNode(r.id)!.transform.x).toBe(0);
    s().undo();
    expect(s().doc.children).toHaveLength(0);
    s().redo();
    s().redo();
    expect(s().findNode(r.id)!.transform.x).toBe(50);
    expect(s().canRedo()).toBe(false);
  });

  it('transactions record a single undo step', () => {
    const r = createRect();
    s().addNodes([r]);
    const before = s().past.length;
    s().beginTransaction('Move');
    for (let i = 1; i <= 20; i++) s().updateNode(r.id, { transform: { x: i } });
    s().commitTransaction();
    expect(s().past.length).toBe(before + 1);
    expect(s().past.at(-1)!.label).toBe('Move');
    s().undo();
    expect(s().findNode(r.id)!.transform.x).toBe(0);
    s().redo();
    expect(s().findNode(r.id)!.transform.x).toBe(20);
  });

  it('cancelTransaction restores the snapshot', () => {
    const r = createRect();
    s().addNodes([r]);
    s().beginTransaction('Move');
    s().updateNode(r.id, { transform: { x: 99 } });
    s().cancelTransaction();
    expect(s().findNode(r.id)!.transform.x).toBe(0);
  });

  it('limits history', () => {
    const r = createRect();
    s().addNodes([r]);
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s().updateNode(r.id, { opacity: i / 1000 });
    expect(s().past.length).toBe(HISTORY_LIMIT);
  });

  it('deletes and reorders', () => {
    const [a, b, c] = [createRect(), createRect(), createRect()];
    s().addNodes([a, b, c]);
    s().reorder([a.id], 'front');
    expect(ids()).toEqual([b.id, c.id, a.id]);
    s().reorder([a.id], 'backward');
    expect(ids()).toEqual([b.id, a.id, c.id]);
    s().reorder([c.id], 'back');
    expect(ids()).toEqual([c.id, b.id, a.id]);
    s().reorder([c.id], 'forward');
    expect(ids()).toEqual([b.id, c.id, a.id]);
    s().deleteNodes([c.id]);
    expect(ids()).toEqual([b.id, a.id]);
  });

  it('groups and ungroups keeping visual placement', () => {
    const a = createRect({ transform: { x: 10 } });
    const b = createEllipse({ transform: { x: 100 } });
    const c = createRect();
    s().addNodes([a, b, c]);
    const gid = s().group([a.id, b.id])!;
    expect(ids()).toEqual([gid, c.id]);
    const g = s().findNode(gid)!;
    expect(g.type === 'group' && g.children.map((n) => n.id)).toEqual([a.id, b.id]);
    s().updateNode(gid, { transform: { x: 5, rotation: 90 } });
    const before = worldBounds(s().doc, a.id)!;
    const released = s().ungroup([gid]);
    expect(released).toEqual([a.id, b.id]);
    const after = worldBounds(s().doc, a.id)!;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(ids()).toEqual([a.id, b.id, c.id]);
    s().undo();
    expect(ids()).toEqual([gid, c.id]);
  });

  it('moves nodes into groups and back', () => {
    const a = createRect({ transform: { x: 50, y: 50 } });
    const inner = createRect();
    const g = createGroup({ children: [inner], transform: { x: 20, y: 0 } });
    s().addNodes([a, g]);
    const before = worldBounds(s().doc, a.id)!;
    s().moveNodes([a.id], g.id, 1);
    const grp = s().findNode(g.id)!;
    expect(grp.type === 'group' && grp.children.map((n) => n.id)).toEqual([inner.id, a.id]);
    expect(worldBounds(s().doc, a.id)!.x).toBeCloseTo(before.x);
    s().moveNodes([a.id], null, 0);
    expect(ids()).toEqual([a.id, g.id]);
    // cannot move a group into itself
    s().moveNodes([g.id], g.id, 0);
    expect(ids()).toEqual([a.id, g.id]);
  });

  it('duplicates and uses the clipboard', () => {
    const a = createRect();
    s().addNodes([a]);
    const [dup] = s().duplicate([a.id]);
    expect(ids()).toEqual([a.id, dup]);
    expect(findNode(s().doc, dup)!.transform.x).toBe(10);
    copyNodes([a.id]);
    const [p1] = pasteNodes();
    const [p2] = pasteNodes();
    expect(findNode(s().doc, p1)!.transform.x).toBe(10);
    expect(findNode(s().doc, p2)!.transform.x).toBe(20);
    cutNodes([a.id]);
    expect(findNode(s().doc, a.id)).toBeNull();
    const [p3] = pasteNodes();
    expect(findNode(s().doc, p3)!.transform.x).toBe(0);
  });

  it('artboard updates are undoable', () => {
    s().setArtboard({ width: 512 });
    expect(s().doc.artboard.width).toBe(512);
    s().undo();
    expect(s().doc.artboard.width).toBe(1024);
  });
});
