// Notes of wireframe documents (docs/wireframe-mode.md → Notes): stickies on the canvas, optionally
// attached to a node. A note is a top-level group with `note: { text, target? }` whose children (the
// sticky and its text) are generated from the text by the `notes` pipeline step, so rendering,
// bounds and hit testing need no special cases. Connector lines are a canvas overlay: they are not
// part of any export. Pure functions on plain documents or immer drafts.
import {
  createGroup,
  createRect,
  createText,
  defaultStroke,
  findNode,
  newId,
  rectsIntersect,
  solid,
  walk,
  worldBounds,
  type DesignDocument,
  type GroupNode,
  type Id,
  type NoteInfo,
  type Rect,
  type SceneNode,
  type Vec,
} from '@/model';
import { frameOf, frameRect, frames } from './screens';
import { WF } from './style';

export type NoteNode = GroupNode & { note: NoteInfo };

export const NOTE_WIDTH = 200;
const PAD = 12;
const FONT_SIZE = 14;
const LINE_HEIGHT = 1.35;
/** Average glyph width in em (Inter at body sizes): the pipeline is pure, so text is wrapped by estimate. */
const CHAR_EM = 0.56;
const MIN_HEIGHT = 48;
/** Space between a target and a note placed next to it. */
export const NOTE_GAP = 24;

type DocLike = Pick<DesignDocument, 'children' | 'wireframe'>;

export const isNoteNode = (n: SceneNode): n is NoteNode => n.type === 'group' && !!n.note;

/** Top-level notes, in document order. */
export const notesOf = (doc: DocLike): NoteNode[] => (doc.wireframe ? (doc.children.filter(isNoteNode) as NoteNode[]) : []);

/** Wraps `text` to the sticky's width (keeps the author's line breaks). */
export function wrapNoteText(text: string): string[] {
  const max = Math.max(4, Math.floor((NOTE_WIDTH - 2 * PAD) / (FONT_SIZE * CHAR_EM)));
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > max) {
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= max) line += ` ${w}`;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The sticky's height for a text (auto height). */
export function noteHeight(text: string): number {
  return Math.max(MIN_HEIGHT, Math.ceil(2 * PAD + wrapNoteText(text).length * FONT_SIZE * LINE_HEIGHT));
}

/** The sticky and its text, in the note's local space (origin top-left), with stable ids. */
export function buildNoteChildren(noteId: Id, text: string): SceneNode[] {
  const h = noteHeight(text);
  const sticky = createRect({
    id: `${noteId}~0`,
    name: 'Sticky',
    width: NOTE_WIDTH,
    height: h,
    transform: { x: NOTE_WIDTH / 2, y: h / 2 },
    fill: solid(WF.note),
    stroke: defaultStroke(solid(WF.noteEdge), WF.strokeWidth),
  });
  const body = createText({
    id: `${noteId}~1`,
    name: 'Text',
    text: wrapNoteText(text).join('\n'),
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    fill: solid(WF.noteInk),
    stroke: defaultStroke(solid(WF.noteInk), 0),
    transform: { x: PAD, y: PAD },
  });
  return [sticky, body];
}

/** A new note (not yet in a document). */
export function createNote(o: { text?: string; target?: Id; x: number; y: number }): NoteNode {
  const g = createGroup({ id: newId('n'), name: 'Note', transform: { x: o.x, y: o.y } });
  const text = o.text ?? '';
  return { ...g, note: { text, ...(o.target ? { target: o.target } : {}) }, children: buildNoteChildren(g.id, text) };
}

/** A note's rectangle in document space (notes are translation-only). */
export const noteRect = (n: NoteNode): Rect => ({ x: n.transform.x, y: n.transform.y, width: NOTE_WIDTH, height: noteHeight(n.note.text) });

const targetRect = (doc: DocLike, id: Id): Rect | null => {
  const node = findNode(doc as DesignDocument, id);
  if (!node) return null;
  return worldBounds(doc as DesignDocument, id);
};

/**
 * Top-left for a new note next to `targetId`: right of its screen (or of the node itself), clear of other notes.
 * When that column would cover the next screen (screens sit 80 px apart, a note is 200 px wide), the column
 * left of the screen is used instead if it is free of screens; with no room on either side, the right one.
 * Null when the target does not exist.
 */
export function notePositionFor(doc: DocLike, targetId: Id): Vec | null {
  const t = targetRect(doc, targetId);
  if (!t) return null;
  const frame = frameOf(doc, targetId);
  const right = frame ? frameRect(frame) : t;
  const others = notesOf(doc).map(noteRect);
  const screens = frames(doc).filter((f) => f.id !== frame?.id).map(frameRect);
  const h = MIN_HEIGHT;
  const stack = (x: number): Vec => {
    let y = Math.round(t.y);
    for (let guard = 0; guard < 200; guard++) {
      const hit = others.find((r) => rectsIntersect(r, { x, y, width: NOTE_WIDTH, height: h + NOTE_GAP }));
      if (!hit) break;
      y = Math.round(hit.y + hit.height + NOTE_GAP / 2);
    }
    return { x, y };
  };
  const coversScreen = (p: Vec) => screens.some((r) => rectsIntersect(r, { x: p.x, y: p.y, width: NOTE_WIDTH, height: h }));
  const onRight = stack(Math.round(right.x + right.width + NOTE_GAP));
  if (!frame || !coversScreen(onRight)) return onRight;
  const onLeft = stack(Math.round(right.x - NOTE_GAP - NOTE_WIDTH));
  return coversScreen(onLeft) ? onRight : onLeft;
}

/** Adds a note (mutates `doc`, a draft or a fresh copy). `target` attaches it and, without a position, places it next to the target. Returns the note id. */
export function addNote(doc: DocLike, o: { text?: string; target?: Id; x?: number; y?: number }): Id {
  if (!doc.wireframe) throw new Error('Not a wireframe document.');
  if (o.target && !targetRect(doc, o.target)) throw new Error(`No node ${o.target} to attach the note to.`);
  const pos = o.x !== undefined && o.y !== undefined ? { x: o.x, y: o.y } : o.target ? notePositionFor(doc, o.target)! : { x: 0, y: 0 };
  const note = createNote({ text: o.text, target: o.target, x: Math.round(pos.x), y: Math.round(pos.y) });
  doc.children.push(note);
  return note.id;
}

/** Whether `id` can be a note's target: any existing node except the note itself and its own parts. */
export function canAttach(doc: DocLike, noteId: Id, targetId: Id): boolean {
  if (targetId === noteId || targetId.startsWith(`${noteId}~`)) return false;
  const t = findNode(doc as DesignDocument, targetId);
  return !!t && !(t.type === 'group' && !!t.note);
}

/** Attaches (or re-attaches) a note; false when the note or the target is not valid. */
export function attachNote(doc: DocLike, noteId: Id, targetId: Id): boolean {
  const n = doc.children.find((c) => c.id === noteId);
  if (!n || !isNoteNode(n) || !canAttach(doc, noteId, targetId)) return false;
  n.note.target = targetId;
  return true;
}

/** Detaches a note (it keeps its place on the canvas). */
export function detachNote(doc: DocLike, noteId: Id): boolean {
  const n = doc.children.find((c) => c.id === noteId);
  if (!n || !isNoteNode(n) || n.note.target === undefined) return false;
  delete n.note.target;
  return true;
}

/** Clears the `target` of every note whose node no longer exists. Returns how many. */
export function clearDanglingTargets(doc: DocLike): number {
  const notes = notesOf(doc).filter((n) => n.note.target !== undefined);
  if (!notes.length) return 0;
  const ids = new Set<Id>();
  walk(doc.children, (n) => void ids.add(n.id));
  let cleared = 0;
  for (const n of notes) {
    if (!ids.has(n.note.target!)) {
      delete n.note.target;
      cleared++;
    }
  }
  return cleared;
}

/** The segment drawn from a note to its target (document space), or null for a free note / a hidden or missing target. */
export function connectorOf(doc: DocLike, note: NoteNode): { from: Vec; to: Vec } | null {
  const id = note.note.target;
  if (id === undefined || !note.visible) return null;
  const t = targetRect(doc, id);
  const target = findNode(doc as DesignDocument, id);
  if (!t || !target || !target.visible) return null;
  const n = noteRect(note);
  const nc = { x: n.x + n.width / 2, y: n.y + n.height / 2 };
  const tc = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
  return { from: edgePoint(n, tc), to: edgePoint(t, nc) };
}

/** Where the ray from the centre of `r` towards `p` leaves `r` (`p` itself when it is inside). */
function edgePoint(r: Rect, p: Vec): Vec {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x: cx, y: cy };
  const k = Math.min(r.width / 2 / (Math.abs(dx) || Infinity), r.height / 2 / (Math.abs(dy) || Infinity));
  return k >= 1 ? p : { x: cx + dx * k, y: cy + dy * k };
}

export interface NoteForExport {
  noteId: Id;
  text: string;
  /** The node the note is attached to (absent: free note). */
  targetId?: Id;
  /** The logical screen (`wireframe.screens[].id`) whose frame contains the target (absent: free note, or a target on the bare canvas). */
  screenId?: Id;
  /** That frame's node id (the variant). */
  frameId?: Id;
}

/** Notes for the AI export: text, what they are attached to, and the screen that contains it. Document order. */
export function notesFor(doc: DocLike): NoteForExport[] {
  return notesOf(doc).map((n) => {
    const out: NoteForExport = { noteId: n.id, text: n.note.text };
    const target = n.note.target;
    if (target !== undefined && findNode(doc as DesignDocument, target)) {
      out.targetId = target;
      const frame = frameOf(doc, target);
      if (frame) {
        out.screenId = frame.screen.screenId;
        out.frameId = frame.id;
      }
    }
    return out;
  });
}
