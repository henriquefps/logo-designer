// SVG text → editable SceneNodes. Used by File → Import SVG, paste, drop, "Open SVG as new
// document", icon libraries and the LogoGo migration. Pure (needs only DOMParser).
import {
  createEllipse,
  createGroup,
  createImage,
  createPath,
  createRect,
  createText,
  defaultStroke,
  ellipseSubpaths,
  IDENTITY,
  multiply,
  rectSubpaths,
  scale as scaleM,
  translate,
  apply,
  boundsIn,
  fromTransform,
  invert,
  isPainted,
  splitColor,
  unionRects,
  type GradientStop,
  type LineCap,
  type LineJoin,
  type Matrix,
  type Paint,
  type Rect,
  type SceneNode,
  type Stroke,
  type SubPath,
} from '@/model';
import { parseColor, toModelColor } from './svg/color';
import { parsePathData, transformSubpaths } from './svg/pathData';
import { computeStyle, INITIAL_STYLE, parseStyleSheet, type Rule, type Style } from './svg/styles';
import { decompose, matrixScale, parseTransform } from './svg/transformAttr';
import { cutNode, leafAreas, type CutMode } from '@/vector/knockout';
import { loadPaper, paperIfLoaded, toPaper } from '@/vector/paperOps';

export interface SvgImportOptions {
  /** Extra matrix applied to the whole drawing (after the viewBox offset). */
  matrix?: Matrix;
  /** Value of `currentColor` at the root (icons). */
  currentColor?: string;
  /**
   * paper.js scope used to turn `clip-path` / `mask` into real geometry. Defaults to the loaded
   * one (`loadPaper()`); without it clips are skipped with a warning. See `ensureSvgGeometry`.
   */
  paper?: paper.PaperScope | null;
}

/** True when the markup uses clip paths or masks (they need paper.js: `await loadPaper()` first). */
export const svgNeedsGeometry = (text: string) => /clip-path|<mask[\s>]|\bmask\s*[=:]/i.test(text);

/** Loads paper.js when the markup needs it, so a following (synchronous) parseSvg resolves clips. */
export async function ensureSvgGeometry(text: string): Promise<void> {
  if (svgNeedsGeometry(text)) await loadPaper();
}

const urlId = (v: string | undefined) => (v ? (/^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(v.trim())?.[1] ?? null) : null);

/** Relative luminance of a #rrggbb colour (0..1). */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export interface SvgImportResult {
  nodes: SceneNode[];
  /** Size of the drawing in user units (viewBox, else width/height). Nodes are offset so the viewBox starts at 0,0. */
  width: number;
  height: number;
  warnings: string[];
}

const SKIP = new Set([
  'defs', 'symbol', 'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient', 'style', 'title', 'desc',
  'metadata', 'filter', 'marker', 'script', 'foreignobject', 'font', 'font-face', 'animate', 'animatetransform', 'set',
]);
const MAX_DEPTH = 32;

const num = (v: string | null | undefined, fallback = 0) => {
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const numList = (v: string | null | undefined) => (v?.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);

export function parseViewBox(v: string | null): Rect | null {
  const n = numList(v);
  if (n.length !== 4 || n[2] <= 0 || n[3] <= 0) return null;
  return { x: n[0], y: n[1], width: n[2], height: n[3] };
}

/** Quick check used by paste handling. */
export const looksLikeSvg = (text: string) => /<svg[\s>]/i.test(text.slice(0, 4096)) && /<\/svg>|\/>\s*$/i.test(text.trim());

class Importer {
  ids = new Map<string, Element>();
  rules: Rule[] = [];
  warnings = new Set<string>();
  viewport = { width: 100, height: 100 };
  useStack: Element[] = [];
  /** Clip paths / masks being resolved (cycles). */
  clipStack: Element[] = [];
  /** > 0 while converting clipPath contents: geometry only (clip-rule, no stroke). */
  inClip = 0;
  scope: paper.PaperScope | null = null;

  constructor(root: Element) {
    const all = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const el of all) {
      const id = el.getAttribute('id');
      if (id && !this.ids.has(id)) this.ids.set(id, el);
      if (el.localName.toLowerCase() === 'style') this.rules.push(...parseStyleSheet(el.textContent ?? ''));
    }
    this.rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  }

  ref(el: Element): Element | null {
    const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? el.getAttribute('xlink:href');
    if (!href?.startsWith('#')) return null;
    return this.ids.get(href.slice(1)) ?? null;
  }

  length(v: string | null, axis: 'x' | 'y' | 'r', fallback = 0) {
    if (v == null) return fallback;
    const s = v.trim();
    if (s.endsWith('%')) {
      const p = parseFloat(s) / 100;
      const { width, height } = this.viewport;
      const base = axis === 'x' ? width : axis === 'y' ? height : Math.hypot(width, height) / Math.SQRT2;
      return Number.isFinite(p) ? p * base : fallback;
    }
    return num(s, fallback);
  }

  // ---------- paints ----------

  gradientChain(el: Element): Element[] {
    const chain = [el];
    let cur = el;
    for (let i = 0; i < 8; i++) {
      const next = this.ref(cur);
      if (!next || chain.includes(next)) break;
      chain.push(next);
      cur = next;
    }
    return chain;
  }

  gradientAttr(chain: Element[], name: string): string | null {
    for (const el of chain) {
      const v = el.getAttribute(name);
      if (v != null) return v;
    }
    return null;
  }

  gradient(el: Element, opacity: number): Paint | null {
    const chain = this.gradientChain(el);
    const withStops = chain.find((g) => Array.from(g.children).some((c) => c.localName.toLowerCase() === 'stop'));
    const stops: GradientStop[] = [];
    if (withStops) {
      for (const s of Array.from(withStops.children)) {
        if (s.localName.toLowerCase() !== 'stop') continue;
        const st = computeStyle(s, {}, this.rules);
        const raw = st['offset'] ?? s.getAttribute('offset') ?? '0';
        const offset = Math.max(0, Math.min(1, raw.trim().endsWith('%') ? num(raw) / 100 : num(raw)));
        const color = toModelColor(st['stop-color'] ?? '#000000', num(st['stop-opacity'], 1) * opacity) ?? '#000000';
        // Offsets must be monotonic.
        const prev = stops[stops.length - 1];
        stops.push({ offset: prev ? Math.max(prev.offset, offset) : offset, color });
      }
    }
    if (!stops.length) return null;
    if (stops.length === 1) return { kind: 'solid', color: stops[0].color };
    const kind = el.localName.toLowerCase() === 'radialgradient' ? 'radial' : 'linear';
    if (kind === 'radial') return { kind, stops };
    const frac = (v: string | null, d: number) => (v == null ? d : v.trim().endsWith('%') ? num(v) / 100 : num(v, d));
    const m = parseTransform(this.gradientAttr(chain, 'gradientTransform'));
    const p1 = apply(m, { x: frac(this.gradientAttr(chain, 'x1'), 0), y: frac(this.gradientAttr(chain, 'y1'), 0) });
    const p2 = apply(m, { x: frac(this.gradientAttr(chain, 'x2'), 1), y: frac(this.gradientAttr(chain, 'y2'), 0) });
    const angle = Math.round(((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI) * 1000) / 1000;
    return { kind, stops, angle: angle === 0 ? 0 : angle };
  }

  paint(value: string | undefined, opacity: number, style: Style): Paint {
    const v = (value ?? 'none').trim();
    if (v === 'none' || v === '') return { kind: 'none' };
    const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/.exec(v);
    if (url) {
      const target = this.ids.get(url[1]);
      const tag = target?.localName.toLowerCase();
      if (target && (tag === 'lineargradient' || tag === 'radialgradient')) {
        const g = this.gradient(target, opacity);
        if (g) return g;
      } else if (target) this.warnings.add('Patterns are not supported; a fallback color was used.');
      return url[2] ? this.paint(url[2], opacity, style) : { kind: 'none' };
    }
    if (v.toLowerCase() === 'currentcolor') return this.paint(style.color ?? '#000000', opacity, style);
    const c = parseColor(v);
    if (!c) return { kind: 'none' };
    const color = toModelColor(v, opacity)!;
    return { kind: 'solid', color };
  }

  fillOf(style: Style): Paint {
    if (this.inClip) return { kind: 'solid', color: '#000000' };
    return this.paint(style.fill, num(style['fill-opacity'], 1), style);
  }

  strokeOf(style: Style, m: Matrix): Stroke {
    if (this.inClip) return defaultStroke();
    const paint = this.paint(style.stroke, num(style['stroke-opacity'], 1), style);
    const k = matrixScale(m) || 1;
    const width = this.length(style['stroke-width'] ?? '1', 'r', 1) * k;
    if (paint.kind === 'none' || width <= 0) return defaultStroke();
    const capRaw = style['stroke-linecap'];
    const cap: LineCap = capRaw === 'round' || capRaw === 'square' ? capRaw : 'butt';
    const joinRaw = style['stroke-linejoin'];
    const join: LineJoin = joinRaw === 'round' || joinRaw === 'bevel' ? joinRaw : 'miter';
    const dash = style['stroke-dasharray'] && style['stroke-dasharray'] !== 'none' ? numList(style['stroke-dasharray']).map((d) => d * k) : [];
    return { paint, width, cap, join, dash: dash.length % 2 ? [...dash, ...dash] : dash };
  }

  base(el: Element, style: Style, fallbackName: string) {
    const name = el.getAttribute('inkscape:label') ?? el.getAttribute('data-name') ?? el.getAttribute('id') ?? fallbackName;
    const init: { name: string; opacity: number; visible: boolean; blendMode?: string } = {
      name,
      opacity: Math.max(0, Math.min(1, num(style.opacity, 1))),
      visible: style.visibility !== 'hidden' && style.visibility !== 'collapse',
    };
    if (style['mix-blend-mode'] && style['mix-blend-mode'] !== 'normal') init.blendMode = style['mix-blend-mode'];
    return init;
  }

  // ---------- elements ----------

  /**
   * Converts one element into nodes, then applies its `clip-path` / `mask` as real geometry.
   * `m` maps the element's parent user space into the frame the nodes are returned in.
   */
  convert(el: Element, m: Matrix, parentStyle: Style, depth: number): SceneNode[] {
    const nodes = this.convertElement(el, m, parentStyle, depth);
    if (!nodes.length) return nodes;
    const style = computeStyle(el, parentStyle, this.rules);
    const clipId = urlId(style['clip-path']);
    const maskId = urlId(style.mask);
    if (!clipId && !maskId) return nodes;
    // Clip and mask live in the element's user space (its own transform included).
    const L = multiply(m, parseTransform(el.getAttribute('transform')));
    let out = nodes;
    if (clipId) out = this.applyClip(clipId, out, L);
    if (maskId && out.length) out = this.applyMask(maskId, out, L);
    return out;
  }

  // ---------- clip-path / mask → geometry ----------

  /** paper.js scope, or null (with a warning) when it is not loaded. */
  geometry(): paper.PaperScope | null {
    if (!this.scope) this.warnings.add('Clip paths and masks were ignored: the geometry engine was not loaded.');
    return this.scope;
  }

  /** World (frame) shapes of converted nodes as one paper item: every leaf's fill area, united. */
  shapeOf(scope: paper.PaperScope, nodes: SceneNode[]): paper.PathItem | null {
    let acc: paper.PathItem | null = null;
    const visit = (n: SceneNode, parent: Matrix) => {
      if (!n.visible) return;
      const mm = multiply(parent, fromTransform(n.transform));
      if (n.type === 'group') return n.children.forEach((c) => visit(c, mm));
      if (n.type === 'text') this.warnings.add('Text inside a clip path or mask was ignored.');
      if (!isPainted(n)) return;
      const { fill } = leafAreas(scope, n, mm);
      if (fill) acc = acc ? acc.unite(fill, { insert: false }) : fill;
    };
    nodes.forEach((n) => visit(n, IDENTITY));
    return acc;
  }

  /** Geometry box of nodes in the user space mapped to the frame by `L` (objectBoundingBox units). */
  bboxIn(nodes: SceneNode[], L: Matrix): Rect | null {
    const inv = invert(L);
    return unionRects(nodes.filter((n) => n.visible).map((n) => boundsIn(n, multiply(inv, fromTransform(n.transform)))));
  }

  /** Intersects (clip) every node with `shape`; texts and images are kept as they are (warning). */
  cut(scope: paper.PaperScope, nodes: SceneNode[], shape: paper.PathItem | null, mode: CutMode): SceneNode[] {
    const hasRaw = (n: SceneNode): boolean => (n.type === 'group' ? n.children.some(hasRaw) : n.type === 'text' || n.type === 'image');
    if (nodes.some(hasRaw)) this.warnings.add('Clipped or masked text and images were imported without the clip.');
    if (!shape || shape.isEmpty()) return mode === 'intersect' ? nodes.filter(hasRaw) : nodes;
    return nodes.map((n) => cutNode(scope, n, IDENTITY, shape, mode)).filter((n): n is SceneNode => !!n);
  }

  /** Content matrix for clipPathUnits / maskContentUnits. Null when the box is empty. */
  unitsMatrix(units: string | null, nodes: SceneNode[], L: Matrix): Matrix | null {
    if (units !== 'objectBoundingBox') return L;
    const bb = this.bboxIn(nodes, L);
    if (!bb || !(bb.width > 0) || !(bb.height > 0)) return null;
    return multiply(L, { a: bb.width, b: 0, c: 0, d: bb.height, e: bb.x, f: bb.y });
  }

  applyClip(id: string, nodes: SceneNode[], L: Matrix): SceneNode[] {
    const clip = this.ids.get(id);
    if (!clip || clip.localName.toLowerCase() !== 'clippath') return nodes; // a missing reference: no clip (as browsers)
    if (this.clipStack.includes(clip)) return nodes;
    const scope = this.geometry();
    if (!scope) return nodes;
    const base = this.unitsMatrix(clip.getAttribute('clipPathUnits'), nodes, L);
    if (!base) return [];
    const M = multiply(base, parseTransform(clip.getAttribute('transform')));
    this.clipStack.push(clip);
    this.inClip++;
    let shapes: SceneNode[];
    try {
      const style = computeStyle(clip, INITIAL_STYLE, this.rules);
      shapes = Array.from(clip.children).flatMap((c) => this.convert(c, M, style, 1));
    } finally {
      this.inClip--;
      this.clipStack.pop();
    }
    let shape = this.shapeOf(scope, shapes);
    // clip-path on the clipPath element itself: intersect.
    const nested = urlId(computeStyle(clip, INITIAL_STYLE, this.rules)['clip-path']);
    if (shape && nested) {
      const inner = this.ids.get(nested);
      if (inner && !this.clipStack.includes(inner)) {
        this.clipStack.push(clip);
        const clipped = this.applyClip(nested, shapes, L);
        this.clipStack.pop();
        shape = this.shapeOf(scope, clipped);
      }
    }
    return this.cut(scope, nodes, shape, 'intersect');
  }

  /**
   * Masks made of solid white and black shapes become geometry (white adds, black removes, in
   * paint order) clipped to the mask region; anything else (gradients, greys, partial opacity) is
   * not supported: the content is kept unmasked with a warning.
   */
  applyMask(id: string, nodes: SceneNode[], L: Matrix): SceneNode[] {
    const mask = this.ids.get(id);
    if (!mask || mask.localName.toLowerCase() !== 'mask') return nodes;
    if (this.clipStack.includes(mask)) return nodes;
    const scope = this.geometry();
    if (!scope) return nodes;
    const unsupported = () => {
      this.warnings.add('Masks with gradients, greys or partial transparency were not applied (the content was kept unmasked).');
      return nodes;
    };
    const M = this.unitsMatrix(mask.getAttribute('maskContentUnits'), nodes, L);
    if (!M) return [];
    this.clipStack.push(mask);
    let content: SceneNode[];
    try {
      const style = computeStyle(mask, INITIAL_STYLE, this.rules);
      content = Array.from(mask.children).flatMap((c) => this.convert(c, M, style, 1));
    } finally {
      this.clipStack.pop();
    }
    // White adds, black removes (paint order). Anything in between is a real luminance mask.
    type Op = { area: paper.PathItem; add: boolean };
    const ops: Op[] = [];
    let ok = true;
    const level = (p: Paint, opacity: number): boolean | null => {
      if (p.kind === 'none') return null;
      if (p.kind !== 'solid') return (ok = false), null;
      const { color, opacity: a } = splitColor(p.color);
      const lum = luminance(color);
      if (lum < 0.005 || a * opacity < 0.005) return false;
      if (lum > 0.995 && a * opacity > 0.995) return true;
      ok = false;
      return null;
    };
    const visit = (n: SceneNode, parent: Matrix, opacity: number) => {
      if (!n.visible || !ok) return;
      const mm = multiply(parent, fromTransform(n.transform));
      const op = opacity * n.opacity;
      if (n.type === 'group') return n.children.forEach((c) => visit(c, mm, op));
      if (n.type === 'image' || n.type === 'text') return void (ok = false);
      if (!isPainted(n)) return;
      const { fill, stroke } = leafAreas(scope, n, mm);
      const f = level(n.fill, op);
      if (fill && f !== null) ops.push({ area: fill, add: f });
      const s = level(n.stroke.paint, op);
      if (stroke && s !== null) ops.push({ area: stroke, add: s });
    };
    content.forEach((n) => visit(n, IDENTITY, 1));
    if (!ok) return unsupported();
    let shape: paper.PathItem | null = null;
    for (const { area, add } of ops) {
      if (add) shape = shape ? shape.unite(area, { insert: false }) : area;
      else if (shape) shape = shape.subtract(area, { insert: false });
    }
    // Mask region (maskUnits, default objectBoundingBox -10% -10% 120% 120%).
    if (shape) {
      const userSpace = mask.getAttribute('maskUnits') === 'userSpaceOnUse';
      const frac = (v: string | null, d: number) => (v == null ? d : v.trim().endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
      let region: SubPath[] | null = null;
      if (userSpace) {
        const x = this.length(mask.getAttribute('x'), 'x', -0.1 * this.viewport.width);
        const y = this.length(mask.getAttribute('y'), 'y', -0.1 * this.viewport.height);
        const w = this.length(mask.getAttribute('width'), 'x', 1.2 * this.viewport.width);
        const h = this.length(mask.getAttribute('height'), 'y', 1.2 * this.viewport.height);
        region = transformSubpaths(rectSubpaths({ width: w, height: h, radius: 0 }), multiply(L, translate(x + w / 2, y + h / 2)));
      } else {
        const bb = this.bboxIn(nodes, L);
        if (bb) {
          const x = bb.x + frac(mask.getAttribute('x'), -0.1) * bb.width;
          const y = bb.y + frac(mask.getAttribute('y'), -0.1) * bb.height;
          const w = frac(mask.getAttribute('width'), 1.2) * bb.width;
          const h = frac(mask.getAttribute('height'), 1.2) * bb.height;
          region = transformSubpaths(rectSubpaths({ width: w, height: h, radius: 0 }), multiply(L, translate(x + w / 2, y + h / 2)));
        }
      }
      if (region) shape = shape.intersect(toPaper(scope, region), { insert: false });
    }
    return this.cut(scope, nodes, shape, 'intersect');
  }

  // ---------- elements ----------

  convertElement(el: Element, m: Matrix, parentStyle: Style, depth: number): SceneNode[] {
    if (depth > MAX_DEPTH) return [];
    const tag = el.localName.toLowerCase();
    if (SKIP.has(tag)) return [];
    const style = computeStyle(el, parentStyle, this.rules);
    if (style.display === 'none') return [];
    const L = multiply(m, parseTransform(el.getAttribute('transform')));

    switch (tag) {
      case 'g':
      case 'a':
      case 'switch':
        return this.group(el, Array.from(el.children), L, style, depth, 'Group');
      case 'svg': {
        const x = this.length(el.getAttribute('x'), 'x');
        const y = this.length(el.getAttribute('y'), 'y');
        const vb = parseViewBox(el.getAttribute('viewBox'));
        let inner = multiply(L, translate(x, y));
        if (vb) {
          const w = this.length(el.getAttribute('width'), 'x', vb.width);
          const h = this.length(el.getAttribute('height'), 'y', vb.height);
          const k = Math.min(w / vb.width, h / vb.height);
          inner = multiply(inner, multiply(scaleM(k, k), translate(-vb.x, -vb.y)));
        }
        return this.group(el, Array.from(el.children), inner, style, depth, 'Group');
      }
      case 'use': {
        const target = this.ref(el);
        if (!target || this.useStack.includes(target) || this.useStack.length > 8) return [];
        const x = this.length(el.getAttribute('x'), 'x');
        const y = this.length(el.getAttribute('y'), 'y');
        let inner = multiply(L, translate(x, y));
        this.useStack.push(target);
        try {
          if (target.localName.toLowerCase() === 'symbol') {
            const vb = parseViewBox(target.getAttribute('viewBox'));
            if (vb) {
              const w = this.length(el.getAttribute('width') ?? target.getAttribute('width'), 'x', vb.width);
              const h = this.length(el.getAttribute('height') ?? target.getAttribute('height'), 'y', vb.height);
              const k = Math.min(w / vb.width, h / vb.height);
              inner = multiply(inner, multiply(scaleM(k, k), translate(-vb.x, -vb.y)));
            }
            const symStyle = computeStyle(target, style, this.rules);
            return this.group(el, Array.from(target.children), inner, symStyle, depth, target.getAttribute('id') ?? 'Symbol', style);
          }
          const nodes = this.convert(target, inner, style, depth + 1);
          if (nodes.length === 1 && el.getAttribute('id')) nodes[0].name = el.getAttribute('id')!;
          const op = num(style.opacity, 1);
          if (op < 1) for (const n of nodes) n.opacity *= op;
          return nodes;
        } finally {
          this.useStack.pop();
        }
      }
      case 'path': {
        const sp = parsePathData(el.getAttribute('d') ?? '');
        return this.pathNode(el, style, L, sp, 'Path');
      }
      case 'rect':
        return this.rect(el, style, L);
      case 'circle':
      case 'ellipse': {
        const cx = this.length(el.getAttribute('cx'), 'x');
        const cy = this.length(el.getAttribute('cy'), 'y');
        const rx = tag === 'circle' ? this.length(el.getAttribute('r'), 'r') : this.length(el.getAttribute('rx'), 'x', NaN);
        const ry = tag === 'circle' ? rx : this.length(el.getAttribute('ry'), 'y', NaN);
        const rxx = Number.isFinite(rx) ? rx : ry;
        const ryy = Number.isFinite(ry) ? ry : rx;
        if (!(rxx > 0) || !(ryy > 0)) return [];
        const local = multiply(L, translate(cx, cy));
        const t = decompose(local);
        if (!t) return this.pathNode(el, style, local, ellipseSubpaths({ rx: rxx, ry: ryy }), 'Ellipse');
        return [
          createEllipse({
            ...this.base(el, style, 'Ellipse'),
            rx: rxx * Math.abs(t.scaleX),
            ry: ryy * Math.abs(t.scaleY),
            fill: this.fillOf(style),
            stroke: this.strokeOf(style, local),
            transform: { x: t.x, y: t.y, rotation: t.rotation, scaleX: Math.sign(t.scaleX) || 1, scaleY: Math.sign(t.scaleY) || 1 },
          }),
        ];
      }
      case 'line': {
        const sp: SubPath[] = [
          {
            closed: false,
            points: [
              { x: this.length(el.getAttribute('x1'), 'x'), y: this.length(el.getAttribute('y1'), 'y'), type: 'corner' },
              { x: this.length(el.getAttribute('x2'), 'x'), y: this.length(el.getAttribute('y2'), 'y'), type: 'corner' },
            ],
          },
        ];
        return this.pathNode(el, { ...style, fill: 'none' }, L, sp, 'Line');
      }
      case 'polyline':
      case 'polygon': {
        const n = numList(el.getAttribute('points'));
        const points = [];
        for (let i = 0; i + 1 < n.length; i += 2) points.push({ x: n[i], y: n[i + 1], type: 'corner' as const });
        if (points.length < 2) return [];
        return this.pathNode(el, style, L, [{ closed: tag === 'polygon', points }], tag === 'polygon' ? 'Polygon' : 'Polyline');
      }
      case 'image':
        return this.image(el, style, L);
      case 'text':
        return this.text(el, style, L);
      default:
        // Unknown container-ish elements: try their children.
        if (el.children.length) return this.group(el, Array.from(el.children), L, style, depth, 'Group');
        return [];
    }
  }

  group(el: Element, children: Element[], L: Matrix, style: Style, depth: number, name: string, baseStyle: Style = style): SceneNode[] {
    const t = decompose(L);
    const childMatrix = t ? { ...IDENTITY } : L;
    const nodes = children.flatMap((c) => this.convert(c, childMatrix, style, depth + 1));
    if (!nodes.length) return [];
    const g = createGroup({ ...this.base(el, baseStyle, name), children: nodes });
    if (t) g.transform = t;
    return [g];
  }

  pathNode(el: Element, style: Style, L: Matrix, sp: SubPath[], name: string): SceneNode[] {
    if (!sp.length) return [];
    return [
      createPath({
        ...this.base(el, style, name),
        subpaths: transformSubpaths(sp, L),
        fill: this.fillOf(style),
        stroke: this.strokeOf(style, L),
        fillRule: (this.inClip ? style['clip-rule'] : style['fill-rule']) === 'evenodd' ? 'evenodd' : 'nonzero',
      }),
    ];
  }

  rect(el: Element, style: Style, L: Matrix): SceneNode[] {
    const x = this.length(el.getAttribute('x'), 'x');
    const y = this.length(el.getAttribute('y'), 'y');
    const w = this.length(el.getAttribute('width'), 'x');
    const h = this.length(el.getAttribute('height'), 'y');
    if (!(w > 0) || !(h > 0)) return [];
    const rxA = el.getAttribute('rx');
    const ryA = el.getAttribute('ry');
    let rx = this.length(rxA ?? ryA, 'x');
    let ry = this.length(ryA ?? rxA, 'y');
    rx = Math.min(Math.max(0, rx), w / 2);
    ry = Math.min(Math.max(0, ry), h / 2);
    const radius = Math.min(rx, ry);
    const local = multiply(L, translate(x + w / 2, y + h / 2));
    const t = decompose(local);
    if (!t) return this.pathNode(el, style, local, rectSubpaths({ width: w, height: h, radius }), 'Rectangle');
    const sx = Math.abs(t.scaleX);
    const sy = Math.abs(t.scaleY);
    return [
      createRect({
        ...this.base(el, style, 'Rectangle'),
        width: w * sx,
        height: h * sy,
        radius: radius * Math.min(sx, sy),
        fill: this.fillOf(style),
        stroke: this.strokeOf(style, local),
        transform: { x: t.x, y: t.y, rotation: t.rotation, scaleX: Math.sign(t.scaleX) || 1, scaleY: Math.sign(t.scaleY) || 1 },
      }),
    ];
  }

  image(el: Element, style: Style, L: Matrix): SceneNode[] {
    const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? el.getAttribute('xlink:href');
    const w = this.length(el.getAttribute('width'), 'x');
    const h = this.length(el.getAttribute('height'), 'y');
    if (!href || !(w > 0) || !(h > 0)) return [];
    if (!href.startsWith('data:')) this.warnings.add('Linked images were kept as links and may not show when exported.');
    const x = this.length(el.getAttribute('x'), 'x');
    const y = this.length(el.getAttribute('y'), 'y');
    const local = multiply(L, translate(x + w / 2, y + h / 2));
    const t = decompose(local) ?? decompose({ ...local, c: 0, b: 0 }) ?? { x: local.e, y: local.f, rotation: 0, scaleX: 1, scaleY: 1 };
    return [
      createImage({
        ...this.base(el, style, 'Image'),
        href,
        width: w * Math.abs(t.scaleX),
        height: h * Math.abs(t.scaleY),
        transform: { x: t.x, y: t.y, rotation: t.rotation, scaleX: Math.sign(t.scaleX) || 1, scaleY: Math.sign(t.scaleY) || 1 },
      }),
    ];
  }

  text(el: Element, style: Style, L: Matrix): SceneNode[] {
    // Best effort: each tspan with its own x/y/dy starts a new line; everything else joins the line.
    const lines: string[] = [];
    let current = '';
    let firstStyle = style;
    let first = true;
    const walk = (node: Element, st: Style) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          current += child.textContent ?? '';
        } else if (child.nodeType === 1) {
          const c = child as Element;
          if (c.localName.toLowerCase() !== 'tspan') continue;
          const cs = computeStyle(c, st, this.rules);
          if (first) {
            firstStyle = cs;
            first = false;
          }
          const newLine = c.hasAttribute('y') || c.hasAttribute('dy');
          if (newLine && current.trim()) {
            lines.push(current);
            current = '';
          }
          walk(c, cs);
        }
      }
    };
    walk(el, style);
    if (current.trim() || !lines.length) lines.push(current);
    const text = lines.map((l) => l.replace(/\s+/g, ' ').trim()).join('\n');
    if (!text.trim()) return [];
    const fs = this.length(firstStyle['font-size'] ?? style['font-size'], 'y', 16) || 16;
    const firstSpan = el.querySelector('tspan');
    const x = this.length(el.getAttribute('x') ?? firstSpan?.getAttribute('x') ?? null, 'x') + this.length(el.getAttribute('dx'), 'x');
    const y = this.length(el.getAttribute('y') ?? firstSpan?.getAttribute('y') ?? null, 'y') + this.length(el.getAttribute('dy'), 'y');
    const lineHeight = 1.2;
    const baseline = (lineHeight - 1) / 2 + 0.8; // matches TextRenderer: first baseline at 0.9 × font size
    const local = multiply(L, translate(x, y - baseline * fs));
    const t = decompose(local) ?? { x: local.e, y: local.f, rotation: 0, scaleX: 1, scaleY: 1 };
    const uniform = Math.abs(Math.abs(t.scaleX) - Math.abs(t.scaleY)) < 1e-6;
    const k = uniform ? Math.abs(t.scaleX) : 1;
    const anchor = style['text-anchor'];
    const family = (style['font-family'] ?? INITIAL_STYLE['font-family']).split(',')[0].replace(/['"]/g, '').trim();
    const weightRaw = style['font-weight'] ?? '400';
    const fontWeight = weightRaw === 'bold' ? 700 : weightRaw === 'normal' ? 400 : num(weightRaw, 400);
    return [
      createText({
        ...this.base(el, style, 'Text'),
        text,
        fontFamily: family || 'Inter Variable',
        fontWeight,
        fontStyle: style['font-style'] === 'italic' || style['font-style'] === 'oblique' ? 'italic' : 'normal',
        fontSize: fs * k,
        letterSpacing: this.length(style['letter-spacing'] === 'normal' ? '0' : style['letter-spacing'], 'x') * k,
        lineHeight,
        align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
        fill: this.fillOf(style),
        stroke: this.strokeOf(style, local),
        transform: uniform
          ? { x: t.x, y: t.y, rotation: t.rotation, scaleX: Math.sign(t.scaleX) || 1, scaleY: Math.sign(t.scaleY) || 1 }
          : t,
      }),
    ];
  }
}

const PX_PER_UNIT: Record<string, number> = { mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16 };

/** A length with a physical unit (mm, cm, in, pt, pc) in px; null for unitless/px/%. */
function physicalLength(v: string | null): number | null {
  const m = v?.trim().match(/^([\d.eE+-]+)\s*(mm|cm|in|pt|pc)$/);
  if (!m) return null;
  const n = parseFloat(m[1]) * PX_PER_UNIT[m[2]];
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parses SVG markup. Throws a readable error when the text is not an SVG document. */
export function parseSvg(text: string, opts: SvgImportOptions = {}): SvgImportResult {
  const dom = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = dom.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg' || dom.getElementsByTagName('parsererror').length) {
    throw new Error('This is not a valid SVG file.');
  }
  const imp = new Importer(root);
  imp.scope = opts.paper === undefined ? paperIfLoaded() : opts.paper;
  const vb = parseViewBox(root.getAttribute('viewBox'));
  let width = vb?.width ?? (num(root.getAttribute('width'), 0) || 0);
  let height = vb?.height ?? (num(root.getAttribute('height'), 0) || 0);
  imp.viewport = { width: width || 100, height: height || 100 };
  // Physical sizes (Inkscape/Illustrator: width="210mm" viewBox="0 0 210 148") import at their
  // real size in px (96 dpi), as browsers render them.
  const physW = physicalLength(root.getAttribute('width'));
  const physH = physicalLength(root.getAttribute('height'));
  const unitScale = vb && (physW || physH) ? Math.min(physW ? physW / vb.width : Infinity, physH ? physH / vb.height : Infinity) : 1;
  width *= unitScale;
  height *= unitScale;
  const rootMatrix = multiply(opts.matrix ?? { ...IDENTITY }, multiply(scaleM(unitScale), translate(-(vb?.x ?? 0), -(vb?.y ?? 0))));
  const rootStyle = computeStyle(root, { ...INITIAL_STYLE, ...(opts.currentColor ? { color: opts.currentColor } : {}) }, imp.rules);
  if (rootStyle.display === 'none') rootStyle.display = 'inline';
  const rootTransform = multiply(rootMatrix, parseTransform(root.getAttribute('transform')));
  // Root children go straight to the output (the root's opacity applies to each).
  const nodes = Array.from(root.children).flatMap((c) => imp.convert(c, rootTransform, rootStyle, 1));
  const rootOpacity = num(rootStyle.opacity, 1);
  if (rootOpacity < 1) for (const n of nodes) n.opacity *= rootOpacity;
  return { nodes, width, height, warnings: [...imp.warnings] };
}
