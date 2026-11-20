import { beforeEach, describe, expect, it } from 'vitest';
import { canResizeNode, canResizeSelection, createDocument, createRect, isUserPaintable, findNode, worldBounds, type DesignDocument, type GroupNode, type ScreenNode } from '@/model';
import { validateDocument } from '@/io/projectFile';
import { exportSvg } from '@/io/svgExport';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { selectedPaintedNodes } from '@/store/usePaintDefaults';
import {
  addNote,
  attachNote,
  buildNoteChildren,
  connectorOf,
  connectorPoints,
  detachNote,
  isNoteNode,
  noteHeight,
  noteRect,
  notePositionFor,
  notesFor,
  notesOf,
  NOTE_WIDTH,
  wrapNoteText,
} from '../notes';
import { materializeDocument } from '../pipeline';
import { addScreen, frameRect, frames } from '../screens';
import { segmentHitsRect } from '../routing';

const s = () => useDocStore.getState();
const node = <T,>(id: string) => findNode(s().doc, id) as T;

/** Wireframe with a phone screen "Home" (with a rect on it) and a tablet screen "Wide". Ids returned. */
function setup() {
  const doc: DesignDocument = createDocument({ name: 'W', wireframe: { screens: [] } });
  const home = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0 });
  const wide = addScreen(doc, { platform: 'tablet', name: 'Wide', x: 700, y: 0 });
  const box = createRect({ name: 'Box', width: 100, height: 40, transform: { x: 100, y: 100 } });
  (doc.children.find((c) => c.id === home) as GroupNode).children.push(box);
  s().load(doc);
  return { home, wide, box: box.id };
}

beforeEach(() => s().load(createDocument()));

const wfDoc = (children: unknown[]) => ({ schemaVersion: 1, artboard: { width: 10, height: 10 }, wireframe: { screens: [] }, children });
const err = (data: unknown) => {
  try {
    validateDocument(data);
  } catch (e) {
    return (e as Error).message;
  }
  return 'no error';
};

describe('note file format', () => {
  it('keeps a note with its text and target', () => {
    const doc = validateDocument(wfDoc([{ type: 'group', id: 'n1', note: { text: 'Pull to refresh', target: 'x' }, children: [] }]));
    expect(doc.children[0]).toMatchObject({ note: { text: 'Pull to refresh', target: 'x' } });
  });
  it('defaults the text and allows a free note', () => {
    const doc = validateDocument(wfDoc([{ type: 'group', note: {}, children: [] }]));
    expect((doc.children[0] as GroupNode).note).toEqual({ text: '' });
  });
  it('names the JSON path of bad notes', () => {
    expect(err(wfDoc([{ type: 'group', note: { text: 5 }, children: [] }]))).toMatch(/children\[0\]\.note\.text/);
    expect(err(wfDoc([{ type: 'group', note: { text: 'a', target: '' }, children: [] }]))).toMatch(/children\[0\]\.note\.target/);
    expect(err(wfDoc([{ type: 'rect', note: { text: 'a' } }]))).toMatch(/children\[0\]\.note: only a group can be a note/);
    expect(err(wfDoc([{ type: 'group', children: [{ type: 'group', note: { text: 'a' }, children: [] }] }]))).toMatch(/children\[0\]\.children\[0\]\.note: notes must be top-level/);
    expect(err(wfDoc([{ type: 'group', note: { text: 'a' }, component: { kind: 'placeholder' }, children: [] }]))).toMatch(/note: a note cannot also be/);
  });
  it('ignores notes (with a warning) outside wireframe documents', () => {
    const r = validateDocument({ schemaVersion: 1, artboard: { width: 10, height: 10 }, children: [{ type: 'group', note: { text: 'a' }, children: [] }] });
    expect((r.children[0] as GroupNode).note).toBeUndefined();
  });
});

describe('note model', () => {
  it('wraps text and sizes the sticky to it', () => {
    expect(wrapNoteText('short')).toEqual(['short']);
    const long = 'word '.repeat(40);
    expect(wrapNoteText(long).length).toBeGreaterThan(3);
    expect(noteHeight(long)).toBeGreaterThan(noteHeight('short'));
    expect(wrapNoteText('a\n\nb')).toEqual(['a', '', 'b']);
    expect(wrapNoteText('x'.repeat(100)).every((l) => l.length <= 24)).toBe(true);
    const [sticky] = buildNoteChildren('n', 'hello');
    expect(sticky).toMatchObject({ id: 'n~0', width: NOTE_WIDTH });
  });

  it('builds the children on load and when the text changes (one undo step)', () => {
    const { box } = setup();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'one', target: box })), { label: 'Add note' });
    const first = node<GroupNode>(id);
    expect(first.children.map((c) => c.id)).toEqual([`${id}~0`, `${id}~1`]);
    const steps = s().past.length;
    s().updateNodes([id], (n) => void (n.type === 'group' && n.note && (n.note.text = 'two lines\nof text')), { label: 'Edit note' });
    expect(s().past).toHaveLength(steps + 1);
    expect((node<GroupNode>(id).children[1] as { text: string }).text).toBe('two lines\nof text');
    s().undo();
    expect((node<GroupNode>(id).children[1] as { text: string }).text).toBe('one');
    // Opening a saved file with stale children rebuilds them.
    const stale = structuredClone(s().doc);
    (stale.children.find((c) => c.id === id) as GroupNode).children = [];
    expect((materializeDocument(stale).children.find((c) => c.id === id) as GroupNode).children).toHaveLength(2);
  });

  it('keeps notes unscaled and unrotated', () => {
    const { box } = setup();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'x', target: box })));
    s().updateNodes([id], (n) => void Object.assign(n.transform, { scaleX: 2, scaleY: 3, rotation: 30 }));
    expect(node<GroupNode>(id).transform).toMatchObject({ scaleX: 1, scaleY: 1, rotation: 0 });
  });
});

describe('attach and detach', () => {
  it('addNote with a target places the note right of the target screen, clear of other notes', () => {
    const { home, box } = setup();
    const doc = structuredClone(s().doc);
    const a = addNote(doc, { text: 'a', target: box });
    const b = addNote(doc, { text: 'b', target: box });
    const na = doc.children.find((c) => c.id === a) as GroupNode;
    const nb = doc.children.find((c) => c.id === b) as GroupNode;
    expect(na.transform.x).toBe(390 + 24); // right of the Home frame
    expect(nb.transform.x).toBe(na.transform.x);
    expect(nb.transform.y).toBeGreaterThan(na.transform.y);
    expect(notePositionFor(doc, 'missing')).toBeNull();
    expect(() => addNote(doc, { target: 'missing' })).toThrow(/No node/);
    expect(home).toBeTruthy();
  });

  it('a note never covers the next screen: left of its screen when the right side is taken, below it when both are', () => {
    // Regression (phase 3 e2e run): screens built side by side (80 px apart) got their notes on the next screen.
    const doc: DesignDocument = createDocument({ name: 'W', wireframe: { screens: [] } });
    const a = addScreen(doc, { platform: 'phone', name: 'A', x: 0, y: 0 });
    const b = addScreen(doc, { platform: 'phone', name: 'B', x: 470, y: 0 });
    const c = addScreen(doc, { platform: 'phone', name: 'C', x: 940, y: 0 });
    const added = (target: string) => {
      const id = addNote(doc, { text: `on ${target}`, target });
      return doc.children.find((n) => n.id === id) as GroupNode;
    };
    const onA = added(a);
    expect(onA.transform.x).toBe(-24 - 200); // left of A: its right side is B
    // B has screens on both sides (found recording the promo: the agent's note on a new menu covered its first
    // sub-screen): below B, at its left edge; a second one stacks under it.
    const onB = added(b);
    const fb = frameRect(doc.children.find((n) => n.id === b) as ScreenNode);
    expect(onB.transform.x).toBe(470);
    expect(onB.transform.y).toBe(fb.y + fb.height + 24);
    const onB2 = added(b);
    expect(onB2.transform.x).toBe(470);
    expect(onB2.transform.y).toBeGreaterThan(onB.transform.y);
    for (const f of [a, b, c].map((id) => frameRect(doc.children.find((n) => n.id === id) as ScreenNode)))
      for (const n of [onA, onB, onB2, added(c)]) expect(segmentHitsRect({ x: n.transform.x + 1, y: n.transform.y + 1 }, { x: n.transform.x + 199, y: n.transform.y + 47 }, f)).toBe(false);
    // C is the last one: right.
    const onC = added(c);
    expect(onC.transform.x).toBe(940 + 390 + 24);
  });

  it('attaches to a screen, a component or a shape, re-attaches, and detaches', () => {
    const { home, wide, box } = setup();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'free', x: 900, y: 50 })));
    expect(node<GroupNode>(id).note).toEqual({ text: 'free' });
    s().apply((d) => void attachNote(d, id, home));
    expect(node<GroupNode>(id).note!.target).toBe(home);
    s().apply((d) => void attachNote(d, id, box));
    expect(node<GroupNode>(id).note!.target).toBe(box);
    s().apply((d) => void attachNote(d, id, wide));
    expect(node<GroupNode>(id).note!.target).toBe(wide);
    s().apply((d) => void detachNote(d, id));
    expect(node<GroupNode>(id).note).toEqual({ text: 'free' });
    // Not attachable: itself, its own parts, another note, a missing node.
    const doc = structuredClone(s().doc);
    const other = addNote(doc, { text: 'other', x: 0, y: 0 });
    expect(attachNote(doc, id, id)).toBe(false);
    expect(attachNote(doc, id, `${id}~0`)).toBe(false);
    expect(attachNote(doc, id, other)).toBe(false);
    expect(attachNote(doc, id, 'nope')).toBe(false);
    expect(detachNote(doc, id)).toBe(false);
  });

  it('the connector runs from the note edge to the target edge and follows both', () => {
    const { home } = setup();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'x', target: home })));
    const c1 = connectorOf(s().doc, node(id))!;
    expect(c1.to.x).toBeCloseTo(390); // right edge of the 390-wide frame
    const r = noteRect(node(id));
    const onEdge = (p: { x: number; y: number }) =>
      [Math.abs(p.x - r.x), Math.abs(p.x - r.x - r.width), Math.abs(p.y - r.y), Math.abs(p.y - r.y - r.height)].some((d) => d < 1e-6);
    expect(onEdge(c1.from)).toBe(true);
    s().updateNodes([id], (n) => void (n.transform.y += 300));
    const c2 = connectorOf(s().doc, node(id))!;
    expect(c2.from.y).not.toBeCloseTo(c1.from.y);
    s().updateNodes([home], (n) => void (n.transform.x -= 100));
    expect(connectorOf(s().doc, node(id))!.to.x).toBeCloseTo(290);
    s().updateNodes([home], (n) => void (n.visible = false));
    expect(connectorOf(s().doc, node(id))).toBeNull();
  });
});

describe('note connectors around other screens', () => {
  /** Three phone screens in a row 80 apart (A, B, C) with a box on C; a note left of A attached to the box. */
  function row() {
    const doc: DesignDocument = createDocument({ name: 'W', wireframe: { screens: [] } });
    const a = addScreen(doc, { platform: 'phone', name: 'A', x: 0, y: 0 });
    const b = addScreen(doc, { platform: 'phone', name: 'B', x: 470, y: 0 });
    const c = addScreen(doc, { platform: 'phone', name: 'C', x: 940, y: 0 });
    const box = createRect({ name: 'Box', width: 100, height: 40, transform: { x: 100, y: 300 } });
    (doc.children.find((n) => n.id === c) as GroupNode).children.push(box);
    s().load(doc);
    return { a, b, c, box: box.id };
  }
  const band = 30;
  const grown = (r: { x: number; y: number; width: number; height: number }) => ({ ...r, y: r.y - band, height: r.height + band });

  it('stays a straight line when it crosses no other screen', () => {
    const { box } = row();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'next to its screen', target: box })));
    const pts = connectorPoints(s().doc, node(id), { band })!;
    const c = connectorOf(s().doc, node(id))!;
    expect(pts).toEqual([c.from, c.to]);
  });

  it('goes around the screens between the note and its target, then runs to the target', () => {
    const { a, b, c, box } = row();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'far from its screen', target: box, x: -280, y: 320 })));
    const straight = connectorOf(s().doc, node(id))!;
    const others = frames(s().doc).filter((f) => f.id === a || f.id === b).map(frameRect);
    // The old straight line cut through A and B.
    expect(others.some((r) => segmentHitsRect(straight.from, straight.to, r))).toBe(true);
    const pts = connectorPoints(s().doc, node(id), { band })!;
    expect(pts.length).toBeGreaterThan(2);
    for (let i = 1; i < pts.length; i++) for (const r of others) expect(segmentHitsRect(pts[i - 1], pts[i], grown(r))).toBe(false);
    // Starts on the note's edge, ends on the box's edge inside C.
    const n = noteRect(node(id));
    const p0 = pts[0];
    expect([p0.x - n.x, n.x + n.width - p0.x, p0.y - n.y, n.y + n.height - p0.y].some((d) => Math.abs(d) < 1e-6)).toBe(true);
    const end = pts[pts.length - 1];
    const cr = frameRect(frames(s().doc).find((f) => f.id === c)!);
    expect(end.x).toBeGreaterThanOrEqual(cr.x);
    const t = worldBounds(s().doc, box)!;
    const onBox = [end.x - t.x, t.x + t.width - end.x, end.y - t.y, t.y + t.height - end.y].some((d) => Math.abs(d) < 1e-6);
    expect(onBox).toBe(true);
    expect(end.y).toBeGreaterThanOrEqual(t.y - 1e-6);
    expect(end.y).toBeLessThanOrEqual(t.y + t.height + 1e-6);
    // Follows a move of the target's screen.
    s().updateNodes([c], (fr) => void (fr.transform.y += 200));
    const moved = connectorPoints(s().doc, node(id), { band })!;
    expect(moved[moved.length - 1].y).not.toBeCloseTo(end.y);
  });

  it('is null for a free note and when the target is hidden', () => {
    const { box } = row();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'free', x: -280, y: 0 })));
    expect(connectorPoints(s().doc, node(id))).toBeNull();
    s().apply((d) => void attachNote(d, id, box));
    expect(connectorPoints(s().doc, node(id))).not.toBeNull();
    s().updateNodes([box], (n) => void (n.visible = false));
    expect(connectorPoints(s().doc, node(id))).toBeNull();
  });
});

describe('deleting a target', () => {
  it('keeps the note and unattaches it (shape, screen)', () => {
    const { home, box } = setup();
    let a = '';
    let b = '';
    s().apply((d) => {
      a = addNote(d, { text: 'on shape', target: box });
      b = addNote(d, { text: 'on screen', target: home });
    });
    s().deleteNodes([box]);
    expect(node<GroupNode>(a).note).toEqual({ text: 'on shape' });
    expect(node<GroupNode>(b).note!.target).toBe(home);
    s().deleteNodes([home]);
    expect(isNoteNode(node(b))).toBe(true);
    expect(node<GroupNode>(b).note).toEqual({ text: 'on screen' });
    s().undo();
    expect(node<GroupNode>(b).note!.target).toBe(home);
  });
});

describe('adopt step', () => {
  it('never pulls a note into a screen frame', () => {
    const { home } = setup();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'x', x: 50, y: 50 }))); // lands on the Home frame
    expect(node<ScreenNode>(home).children.some((c) => c.id === id)).toBe(false);
    s().updateNodes([id], (n) => void (n.transform.x = 60)); // a drag ends on the frame
    expect(s().doc.children.some((c) => c.id === id)).toBe(true);
    expect(node<ScreenNode>(home).children.some((c) => c.id === id)).toBe(false);
    // A plain shape with the same move is adopted, so the test would notice if adopt stopped running.
    const r = createRect({ name: 'R', width: 10, height: 10, transform: { x: 100, y: 100 } });
    s().addNodes([r]);
    expect(node<ScreenNode>(home).children.some((c) => c.id === r.id)).toBe(true);
  });
});

describe('export', () => {
  it('screen exports leave notes out, whole-canvas export includes them', async () => {
    const { home, box } = setup();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'Only visible offline', x: 20, y: 20, target: box }))); // on top of the frame
    const screen = (await exportSvg(s().doc, { scope: 'screen', screenId: home, outlineText: false })).svg;
    expect(screen).not.toContain('Only visible offline');
    expect(screen).not.toContain(id);
    expect(screen).not.toContain('#fde68a');
    const all = (await exportSvg(s().doc, { outlineText: false })).svg;
    expect(all).toContain('Only visible offline');
  });
});

describe('notesFor', () => {
  it('lists notes with their target and the screen that contains it', () => {
    const { home, wide, box } = setup();
    const doc = structuredClone(s().doc);
    const onShape = addNote(doc, { text: 'shape', target: box });
    const onFrame = addNote(doc, { text: 'frame', target: wide });
    const free = addNote(doc, { text: 'free', x: 0, y: 900 });
    const logical = (frameId: string) => (doc.children.find((c) => c.id === frameId) as ScreenNode).screen.screenId;
    expect(notesFor(doc)).toEqual([
      { noteId: onShape, text: 'shape', targetId: box, screenId: logical(home), frameId: home },
      { noteId: onFrame, text: 'frame', targetId: wide, screenId: logical(wide), frameId: wide },
      { noteId: free, text: 'free' },
    ]);
    expect(notesOf(doc)).toHaveLength(3);
  });
  it('treats a dangling target as a free note and a non-wireframe document as empty', () => {
    const doc = createDocument({ wireframe: { screens: [] } });
    const id = addNote(doc, { text: 'x', x: 0, y: 0 });
    (doc.children[0] as GroupNode).note!.target = 'gone';
    expect(notesFor(doc)).toEqual([{ noteId: id, text: 'x' }]);
    expect(notesFor(createDocument())).toEqual([]);
  });
});

describe('editing traits', () => {
  it('notes cannot be resized and are not painted objects; other nodes are unaffected', () => {
    const { home, box } = setup();
    let id = '';
    s().apply((d) => void (id = addNote(d, { text: 'x', target: box })));
    expect(canResizeNode(node(id))).toBe(false);
    expect(isUserPaintable(node(id))).toBe(false);
    expect(canResizeNode(node(box))).toBe(true);
    expect(canResizeSelection(s().doc, [home, box])).toBe(true);
    expect(canResizeSelection(s().doc, [box, id])).toBe(false);
    useEditorStore.getState().setSelection([id]);
    expect(selectedPaintedNodes()).toHaveLength(0); // the toolbar swatches keep the defaults
    useEditorStore.getState().setSelection([box]);
    expect(selectedPaintedNodes()).toHaveLength(1);
    useEditorStore.getState().setSelection([]);
  });
});
