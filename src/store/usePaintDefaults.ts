import { create } from 'zustand';
import { DEFAULT_FILL_COLOR, defaultStroke, none, solid, walk, findNode, type Id, type Paint, type SceneNode, type Stroke } from '@/model';
import { useDocStore } from './useDocStore';
import { useEditorStore } from './useEditorStore';

/**
 * Current fill and stroke (Illustrator's fill/stroke swatches): used for new objects and
 * applied to the selection when edited. Saved per browser.
 */
export interface PaintDefaults {
  fill: Paint;
  stroke: Paint;
  strokeWidth: number;
  /** The swatch in front (keyboard X toggles it in Illustrator; here it follows the last clicked one). */
  active: 'fill' | 'stroke';
  set: (patch: Partial<Pick<PaintDefaults, 'fill' | 'stroke' | 'strokeWidth' | 'active'>>) => void;
}

const KEY = 'designer.paint';
export const DEFAULT_PAINT = { fill: solid(DEFAULT_FILL_COLOR) as Paint, stroke: none() as Paint, strokeWidth: 2 };

function isPaint(p: unknown): p is Paint {
  if (!p || typeof p !== 'object') return false;
  const k = (p as Paint).kind;
  if (k === 'none') return true;
  if (k === 'solid') return typeof (p as { color?: unknown }).color === 'string';
  return (k === 'linear' || k === 'radial') && Array.isArray((p as { stops?: unknown }).stops);
}

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && isPaint(v.fill) && isPaint(v.stroke) && typeof v.strokeWidth === 'number' && v.strokeWidth >= 0) {
      return { fill: v.fill as Paint, stroke: v.stroke as Paint, strokeWidth: v.strokeWidth as number };
    }
  } catch {
    /* storage unavailable or invalid */
  }
  return structuredClone(DEFAULT_PAINT);
}

export const usePaintDefaults = create<PaintDefaults>()((set, get) => ({
  ...load(),
  active: 'fill',
  set: (patch) => {
    set(patch);
    const { fill, stroke, strokeWidth } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ fill, stroke, strokeWidth }));
    } catch {
      /* storage unavailable */
    }
  },
}));

const painted = (n: SceneNode): n is Extract<SceneNode, { fill: Paint; stroke: Stroke }> => 'fill' in n && 'stroke' in n;

/** Painted leaves of the selection (groups are walked), skipping locked nodes. */
export function selectedPaintedNodes() {
  const doc = useDocStore.getState().doc;
  const out: Extract<SceneNode, { fill: Paint; stroke: Stroke }>[] = [];
  const roots = useEditorStore
    .getState()
    .selection.map((id) => findNode(doc, id))
    .filter((n): n is SceneNode => !!n);
  walk(roots, (n) => {
    if (n.locked) return false;
    if (painted(n)) out.push(n);
  });
  return out;
}

/** Applies fill/stroke/width to the selection (one undo step) and makes them the current paint. */
export function applyPaint(patch: { fill?: Paint; stroke?: Paint; strokeWidth?: number }, label = 'Change color') {
  usePaintDefaults.getState().set(patch);
  const ids: Id[] = selectedPaintedNodes().map((n) => n.id);
  if (!ids.length) return;
  useDocStore.getState().updateNodes(
    ids,
    (n) => {
      if (!('fill' in n) || !('stroke' in n)) return;
      if (patch.fill) n.fill = structuredClone(patch.fill);
      if (patch.stroke) {
        n.stroke.paint = structuredClone(patch.stroke);
        // Giving a stroke to an object without one: use the current width.
        if (patch.stroke.kind !== 'none' && n.stroke.width <= 0) n.stroke.width = usePaintDefaults.getState().strokeWidth || 1;
      }
      if (patch.strokeWidth !== undefined) n.stroke.width = patch.strokeWidth;
    },
    { label },
  );
}

/** Swaps fill and stroke (selection and defaults). */
export function swapPaint() {
  const sel = selectedPaintedNodes()[0];
  const cur = usePaintDefaults.getState();
  const fill = sel ? sel.fill : cur.fill;
  const stroke = sel ? sel.stroke.paint : cur.stroke;
  applyPaint({ fill: structuredClone(stroke), stroke: structuredClone(fill) }, 'Swap fill and stroke');
}

export function resetPaint() {
  applyPaint(structuredClone(DEFAULT_PAINT), 'Default fill and stroke');
}

// ---------------------------------------------------------------------------------------------
// Styles for new objects

const clone = <T,>(v: T): T => structuredClone(v);
const width = () => usePaintDefaults.getState().strokeWidth || 1;

/** Closed shapes (rectangle, ellipse, polygon, closed pen paths): current fill and stroke. */
export function shapeStyle(): { fill: Paint; stroke: Stroke } {
  const { fill, stroke } = usePaintDefaults.getState();
  return { fill: clone(fill), stroke: stroke.kind === 'none' ? defaultStroke() : defaultStroke(clone(stroke), width()) };
}

/** A visible color for line-like tools when the stroke is None: the fill color, else black. */
function linePaint(): Paint {
  const { fill, stroke } = usePaintDefaults.getState();
  if (stroke.kind !== 'none') return clone(stroke);
  if (fill.kind !== 'none') return clone(fill);
  return solid('#000000');
}

/** Lines, pencil and open pen paths: no fill, the current stroke (or the fill color when stroke is None). */
export function lineStyle(): { fill: Paint; stroke: Stroke } {
  return { fill: none(), stroke: { ...defaultStroke(linePaint(), width()), cap: 'round', join: 'round' } };
}

/** Brush strokes are filled outlines painted with the stroke color (Illustrator), else the fill. */
export function brushPaint(): Paint {
  return linePaint();
}

/** Text: the current fill, or the stroke color when the fill is None. */
export function textFill(): Paint {
  const { fill, stroke } = usePaintDefaults.getState();
  if (fill.kind !== 'none') return clone(fill);
  if (stroke.kind !== 'none') return clone(stroke);
  return solid('#000000');
}
