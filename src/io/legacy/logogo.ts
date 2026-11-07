// LogoGo (the previous app) → Designer documents. Pure: icon rendering is injected so tests can
// stub it. Old shape: archive/logogo-2-wip src/types/{element,canvas,project}.ts. Every element is
// drawn at translate(x,y) rotate(rotation) scale(flipH, flipV) around its center on a 512 canvas.
import {
  apply,
  createDocument,
  createEllipse,
  createGroup,
  createImage,
  createPath,
  createRect,
  createText,
  defaultStroke,
  fromTransform,
  linear,
  newId,
  none,
  solid,
  translate,
  type Artboard,
  type DesignDocument,
  type Paint,
  type SceneNode,
  type Stroke,
  type SubPath,
  type Transform,
} from '@/model';
import { toModelColor } from '../svg/color';
import { parsePathData } from '../svg/pathData';
import { parseSvg } from '../svgImport';

export const LEGACY_STORAGE_KEY = 'logogo-project-storage';
export const LEGACY_CANVAS_SIZE = 512;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
const text = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export interface LegacyProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  canvasSettings: Obj;
  elements: Obj[];
}

/** Renders a library icon to SVG markup (lucide 24-unit or phosphor 256-unit viewBox), or null when unknown. */
export type IconRenderer = (icon: { library: 'lucide' | 'phosphor'; name: string; color: string; strokeWidth?: number; weight?: string }) => Promise<string | null>;

/** Reads the zustand-persist envelope (`{ state: { projects, projectOrder }, version }`), tolerating older shapes. */
export function readLegacyProjects(raw: string | null): LegacyProject[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const state = isObj(data) && isObj(data.state) ? data.state : data;
  if (!isObj(state)) return [];
  const projects = state.projects;
  const list: unknown[] = Array.isArray(projects) ? projects : isObj(projects) ? Object.values(projects) : [];
  const order = Array.isArray(state.projectOrder) ? (state.projectOrder as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const out = list.filter(isObj).map(
    (p): LegacyProject => ({
      id: text(p.id, newId('legacy')),
      name: text(p.name, 'LogoGo project').trim() || 'LogoGo project',
      createdAt: num(p.createdAt, Date.now()),
      updatedAt: num(p.updatedAt, Date.now()),
      canvasSettings: isObj(p.canvasSettings) ? p.canvasSettings : {},
      elements: Array.isArray(p.elements) ? p.elements.filter(isObj) : [],
    }),
  );
  if (order.length) out.sort((a, b) => (order.indexOf(a.id) + 1 || 1e9) - (order.indexOf(b.id) + 1 || 1e9));
  return out;
}

const colorPaint = (v: unknown): Paint => {
  if (typeof v !== 'string' || !v || v === 'none' || v === 'transparent') return none();
  const c = toModelColor(v);
  return c ? solid(c) : none();
};

function strokeOf(color: unknown, width: unknown, round = false): Stroke {
  const paint = colorPaint(color);
  const w = num(width, 0);
  if (paint.kind === 'none' || w <= 0) return defaultStroke();
  return { ...defaultStroke(paint, w), cap: round ? 'round' : 'butt', join: round ? 'round' : 'miter' };
}

/** Background → artboard paint. Rounded/circle backgrounds become a locked shape under the artwork. */
export function convertBackground(cs: Obj): { artboard: Artboard; shape: SceneNode | null } {
  const type = text(cs.bgType, 'solid');
  const size = LEGACY_CANVAS_SIZE;
  let paint: Paint;
  if (type === 'transparent') paint = none();
  else if (type === 'gradient') {
    const a = toModelColor(text(cs.bgGradientStart, '#3f3a2f')) ?? '#3f3a2f';
    const b = toModelColor(text(cs.bgGradientEnd, '#7a7259')) ?? '#7a7259';
    paint = linear(a, b, num(cs.bgGradientAngle, 135));
  } else paint = colorPaint(text(cs.bgColor, '#ffffff'));
  const shape = text(cs.bgShape, 'square');
  if (paint.kind === 'none' || shape === 'square') return { artboard: { width: size, height: size, background: paint }, shape: null };
  const base = { name: 'Background', locked: true, fill: paint, stroke: defaultStroke(), transform: { x: size / 2, y: size / 2 } };
  const node =
    shape === 'circle'
      ? createEllipse({ ...base, rx: size / 2, ry: size / 2 })
      : createRect({ ...base, width: size, height: size, radius: shape === 'squircle' ? 140 : 64 });
  return { artboard: { width: size, height: size, background: none() }, shape: node };
}

function baseOf(el: Obj, fallbackName: string) {
  const fh = el.flipH === true ? -1 : 1;
  const fv = el.flipV === true ? -1 : 1;
  const transform: Transform = { x: num(el.x, LEGACY_CANVAS_SIZE / 2), y: num(el.y, LEGACY_CANVAS_SIZE / 2), rotation: num(el.rotation), scaleX: fh, scaleY: fv };
  return {
    name: text(el.label) || fallbackName,
    locked: el.locked === true,
    opacity: Math.max(0, Math.min(1, num(el.opacity, 100) / 100)),
    transform,
  };
}

function legacyPoints(points: unknown, closed: boolean): SubPath[] {
  if (!Array.isArray(points)) return [];
  const pts = points.filter(isObj).map((p) => {
    const x = num(p.x);
    const y = num(p.y);
    const q: SubPath['points'][number] = { x, y, type: 'corner' };
    if (p.handleInX !== undefined && p.handleInY !== undefined) q.in = { x: x + num(p.handleInX), y: y + num(p.handleInY) };
    if (p.handleOutX !== undefined && p.handleOutY !== undefined) q.out = { x: x + num(p.handleOutX), y: y + num(p.handleOutY) };
    if (q.in && q.out) q.type = 'smooth';
    return q;
  });
  return pts.length >= 2 ? [{ points: pts, closed }] : [];
}

async function convertElement(el: Obj, renderIcon: IconRenderer): Promise<SceneNode | null> {
  switch (el.type) {
    case 'text': {
      const size = num(el.size, 48);
      const b = baseOf(el, text(el.text, 'Text').slice(0, 24) || 'Text');
      const node = createText({
        ...b,
        text: text(el.text, 'Text'),
        fontFamily: text(el.fontFamily, 'Inter Variable'),
        fontWeight: num(el.fontWeight, 400),
        fontSize: size,
        lineHeight: 1.2,
        align: 'center',
        fill: colorPaint(el.color ?? '#000000'),
      });
      // Old text was centered on (x, y) (anchor middle, baseline central); ours hangs from its top.
      const lines = node.text.split('\n').length;
      const center = apply(fromTransform(node.transform), { x: 0, y: (lines * size * node.lineHeight) / 2 });
      node.transform.x += node.transform.x - center.x;
      node.transform.y += node.transform.y - center.y;
      return node;
    }
    case 'image': {
      const src = text(el.src);
      if (!src) return null;
      const size = num(el.size, 128);
      const nw = num(el.naturalWidth, size) || size;
      const nh = num(el.naturalHeight, size) || size;
      // Old images filled a size×size square (cover). Keep the aspect ratio, longest side = size.
      const k = size / Math.max(nw, nh);
      return createImage({ ...baseOf(el, 'Image'), href: src, width: nw * k, height: nh * k });
    }
    case 'shape': {
      const b = baseOf(el, 'Shape');
      const w = Math.abs(num(el.width, 100));
      const h = Math.abs(num(el.height, 100));
      const fill = colorPaint(el.fill);
      switch (el.shape) {
        case 'rectangle':
          return createRect({ ...b, name: text(el.label) || 'Rectangle', width: w, height: h, radius: num(el.cornerRadius), fill, stroke: strokeOf(el.stroke, el.strokeWidth) });
        case 'ellipse':
          return createEllipse({ ...b, name: text(el.label) || 'Ellipse', rx: w / 2, ry: h / 2, fill, stroke: strokeOf(el.stroke, el.strokeWidth) });
        case 'line': {
          const sw = num(el.width, 100);
          const sh = num(el.height, 0);
          return createPath({
            ...b,
            name: text(el.label) || 'Line',
            subpaths: [{ closed: false, points: [{ x: -sw / 2, y: -sh / 2, type: 'corner' }, { x: sw / 2, y: sh / 2, type: 'corner' }] }],
            fill: none(),
            stroke: strokeOf(el.stroke, el.strokeWidth, true),
          });
        }
        default: {
          const pathData = text(el.pathData);
          const closed = el.closed === true;
          const subpaths = pathData ? parsePathData(pathData) : legacyPoints(el.points, closed);
          if (!subpaths.length) return null;
          return createPath({
            ...b,
            name: text(el.label) || 'Path',
            subpaths,
            fill: pathData || closed ? fill : none(),
            stroke: strokeOf(el.stroke, el.strokeWidth, true),
          });
        }
      }
    }
    case 'icon': {
      const library = el.iconType === 'phosphor' ? 'phosphor' : 'lucide';
      const name = text(el.name);
      const color = toModelColor(text(el.color, '#000000')) ?? '#000000';
      const markup = name
        ? await renderIcon({ library, name, color, strokeWidth: el.strokeWidth === undefined ? undefined : num(el.strokeWidth, 2), weight: text(el.weight) || undefined })
        : null;
      if (!markup) return null;
      const vb = library === 'phosphor' ? 256 : 24;
      // Icon content centered on the group origin, scaled from its viewBox to `size`.
      const parsed = parseSvg(markup, { currentColor: color, matrix: translate(-vb / 2, -vb / 2) });
      if (!parsed.nodes.length) return null;
      const b = baseOf(el, name);
      const k = num(el.size, 64) / vb;
      return createGroup({
        ...b,
        children: parsed.nodes,
        transform: { ...b.transform, scaleX: b.transform.scaleX * k, scaleY: b.transform.scaleY * k },
      });
    }
    default:
      return null;
  }
}

export interface ConvertResult {
  doc: DesignDocument;
  converted: number;
  skipped: number;
}

/** Converts one LogoGo project. Never throws for a single bad element: it is counted as skipped. */
export async function convertLegacyProject(p: LegacyProject, renderIcon: IconRenderer): Promise<ConvertResult> {
  const { artboard, shape } = convertBackground(p.canvasSettings);
  const children: SceneNode[] = shape ? [shape] : [];
  let converted = 0;
  let skipped = 0;
  for (const el of p.elements) {
    try {
      const node = await convertElement(el, renderIcon);
      if (node) {
        children.push(node);
        converted++;
      } else skipped++;
    } catch {
      skipped++;
    }
  }
  const doc = createDocument({ name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, artboard, children });
  return { doc, converted, skipped };
}
