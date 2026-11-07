import { createGroup, createPath, none, solid } from '@/model/factories';
import { IDENTITY, apply, multiply, scale as scaleM, translate, type Matrix } from '@/model/matrix';
import type { LineCap, LineJoin, Paint, PathNode, SceneNode, SubPath } from '@/model/types';
import { pathDataToSubpaths } from './svgPath';

/**
 * Minimal internal SVG → editable nodes parser for icons (path, circle, ellipse, rect, line, polyline,
 * polygon, nested <g>, transforms). The full SVG importer may replace it later.
 * String based on purpose, so it runs (and is tested) without a DOM.
 */

export interface SvgToNodesOptions {
  /** Replaces `currentColor` (and unresolvable paints). #rrggbb. */
  color: string;
  /** Size in document px of the icon's longest viewBox side. */
  size: number;
  /** Overrides the stroke width of every stroked element, in icon units (scaled with the icon). null/undefined keeps the original. */
  strokeWidth?: number | null;
  name?: string;
}

interface El {
  tag: string;
  attrs: Record<string, string>;
  children: El[];
}

const SKIP = new Set(['defs', 'title', 'desc', 'style', 'mask', 'clippath', 'metadata', 'symbol', 'filter', 'lineargradient', 'radialgradient', 'pattern', 'animate', 'animatetransform', 'set']);

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) attrs[m[1]] = m[2] ?? m[3];
  return attrs;
}

export function parseXml(src: string): El | null {
  const clean = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  const re = /<(\/)?([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/)?>/g;
  const root: El = { tag: '#root', attrs: {}, children: [] };
  const stack: El[] = [root];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const [, closing, rawTag, attrSrc, selfClose] = m;
    const tag = rawTag.toLowerCase().replace(/^svg:/, '');
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const el: El = { tag, attrs: parseAttrs(attrSrc), children: [] };
    stack[stack.length - 1].children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root.children.find((c) => c.tag === 'svg') ?? null;
}

const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', yellow: '#ffff00', orange: '#ffa500', transparent: 'none' };
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Returns #rrggbb, or null for `none`. Unknown values fall back to `current`. */
export function resolveColor(value: string, current: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor' || v === 'inherit' || v === '') return current;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    const h = hex[1];
    if (h.length <= 4) return '#' + [...h.slice(0, 3)].map((c) => c + c).join('');
    return '#' + h.slice(0, 6);
  }
  const rgb = /^rgba?\(([^)]+)\)/.exec(v);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)));
    if ([r, g, b].every((n) => Number.isFinite(n))) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
  if (NAMED[v]) return NAMED[v] === 'none' ? null : NAMED[v];
  return current;
}

function withAlpha(color: string, alpha: number): string {
  return alpha >= 1 ? color : color + hex2(alpha * 255);
}

export function parseTransform(src: string | undefined): Matrix {
  let m = IDENTITY;
  if (!src) return m;
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(src))) {
    const a = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let n: Matrix | null = null;
    switch (t[1]) {
      case 'translate':
        n = translate(a[0] ?? 0, a[1] ?? 0);
        break;
      case 'scale':
        n = scaleM(a[0] ?? 1, a[1] ?? a[0] ?? 1);
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
        const rot = { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 };
        n = multiply(multiply(translate(cx, cy), rot), translate(-cx, -cy));
        break;
      }
      case 'matrix':
        if (a.length === 6) n = { a: a[0], b: a[1], c: a[2], d: a[3], e: a[4], f: a[5] };
        break;
    }
    if (n && Object.values(n).every(Number.isFinite)) m = multiply(m, n);
  }
  return m;
}

const num = (v: string | undefined, d = 0) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : d;
};
const f = (n: number) => +n.toFixed(4);

/** Shape element → path data in its own coordinate space. */
export function shapeToD(el: El): string | null {
  const a = el.attrs;
  switch (el.tag) {
    case 'path':
      return a.d ?? null;
    case 'circle':
    case 'ellipse': {
      const rx = el.tag === 'circle' ? num(a.r) : num(a.rx, num(a.ry));
      const ry = el.tag === 'circle' ? rx : num(a.ry, rx);
      if (rx <= 0 || ry <= 0) return null;
      const cx = num(a.cx);
      const cy = num(a.cy);
      return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
    }
    case 'rect': {
      const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
      if (w <= 0 || h <= 0) return null;
      let rx = a.rx !== undefined ? num(a.rx) : a.ry !== undefined ? num(a.ry) : 0;
      let ry = a.ry !== undefined ? num(a.ry) : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return `M${x} ${y}H${f(x + w)}V${f(y + h)}H${x}Z`;
      return `M${f(x + rx)} ${y}H${f(x + w - rx)}A${rx} ${ry} 0 0 1 ${f(x + w)} ${f(y + ry)}V${f(y + h - ry)}A${rx} ${ry} 0 0 1 ${f(x + w - rx)} ${f(y + h)}H${f(x + rx)}A${rx} ${ry} 0 0 1 ${x} ${f(y + h - ry)}V${f(y + ry)}A${rx} ${ry} 0 0 1 ${f(x + rx)} ${y}Z`;
    }
    case 'line':
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const n = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      if (n.length < 4 || n.some((v) => !Number.isFinite(v))) return null;
      let d = `M${n[0]} ${n[1]}`;
      for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
      return el.tag === 'polygon' ? d + 'Z' : d;
    }
  }
  return null;
}

interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  cap: LineCap;
  join: LineJoin;
  fillRule: 'nonzero' | 'evenodd';
  fillOpacity: number;
  strokeOpacity: number;
  dash: number[];
}

const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'stroke-dasharray'];

function inherit(parent: Style, el: El): Style {
  const props: Record<string, string> = {};
  for (const p of PROPS) if (el.attrs[p] !== undefined) props[p] = el.attrs[p];
  if (el.attrs.style) {
    for (const decl of el.attrs.style.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
  }
  const s = { ...parent };
  if (props.fill) s.fill = props.fill;
  if (props.stroke) s.stroke = props.stroke;
  if (props['stroke-width']) s.strokeWidth = num(props['stroke-width'], s.strokeWidth);
  if (props['stroke-linecap']) s.cap = props['stroke-linecap'] as LineCap;
  if (props['stroke-linejoin']) s.join = (props['stroke-linejoin'] === 'miter-clip' ? 'miter' : props['stroke-linejoin']) as LineJoin;
  if (props['fill-rule']) s.fillRule = props['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero';
  if (props['fill-opacity']) s.fillOpacity = num(props['fill-opacity'], 1);
  if (props['stroke-opacity']) s.strokeOpacity = num(props['stroke-opacity'], 1);
  if (props['stroke-dasharray']) {
    s.dash = props['stroke-dasharray'] === 'none' ? [] : props['stroke-dasharray'].split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  }
  return s;
}

function transformSubpaths(sps: SubPath[], m: Matrix): SubPath[] {
  return sps.map((sp) => ({
    closed: sp.closed,
    points: sp.points.map((p) => {
      const q = apply(m, p);
      return { type: p.type, x: q.x, y: q.y, ...(p.in && { in: apply(m, p.in) }), ...(p.out && { out: apply(m, p.out) }) };
    }),
  }));
}

function viewBoxOf(svg: El): { x: number; y: number; w: number; h: number } {
  const vb = (svg.attrs.viewbox ?? svg.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const w = num(svg.attrs.width, 24);
  const h = num(svg.attrs.height, w);
  return { x: 0, y: 0, w, h };
}

/**
 * Converts icon SVG markup into a centered node (origin = icon center). Returns a single `path` when the
 * icon has one shape, else a `group` of paths. Null when nothing drawable was found.
 */
export function svgToNodes(svgSrc: string, opts: SvgToNodesOptions): SceneNode | null {
  const svg = parseXml(svgSrc);
  if (!svg) return null;
  const vb = viewBoxOf(svg);
  const s = opts.size / Math.max(vb.w, vb.h);
  const root = multiply(scaleM(s), translate(-(vb.x + vb.w / 2), -(vb.y + vb.h / 2)));
  const base: Style = { fill: '#000000', stroke: 'none', strokeWidth: 1, cap: 'butt', join: 'miter', fillRule: 'nonzero', fillOpacity: 1, strokeOpacity: 1, dash: [] };
  const out: PathNode[] = [];

  const walk = (el: El, parent: Style, ctm: Matrix) => {
    if (SKIP.has(el.tag)) return;
    const style = inherit(parent, el);
    const m = multiply(ctm, parseTransform(el.attrs.transform));
    if (el.tag === 'svg' || el.tag === 'g' || el.tag === 'a') {
      for (const c of el.children) walk(c, style, m);
      return;
    }
    const d = shapeToD(el);
    if (!d) return;
    const subpaths = transformSubpaths(pathDataToSubpaths(d), m);
    if (!subpaths.length) return;
    const fillColor = resolveColor(style.fill, opts.color);
    const strokeColor = resolveColor(style.stroke, opts.color);
    if (!fillColor && !strokeColor) return;
    const sw = (opts.strokeWidth ?? style.strokeWidth) * s;
    const fill: Paint = fillColor && el.tag !== 'line' ? solid(withAlpha(fillColor, style.fillOpacity)) : none();
    const stroke = {
      paint: strokeColor ? solid(withAlpha(strokeColor, style.strokeOpacity)) : none(),
      width: strokeColor ? sw : 0,
      cap: style.cap,
      join: style.join,
      dash: style.dash.map((v) => v * s),
    };
    const opacity = Math.max(0, Math.min(1, num(el.attrs.opacity, 1)));
    out.push(createPath({ name: opts.name ?? 'Path', subpaths, fill, stroke, fillRule: style.fillRule, opacity }));
  };
  walk(svg, base, root);

  if (!out.length) return null;
  if (out.length === 1) {
    if (opts.name) out[0].name = opts.name;
    return out[0];
  }
  return createGroup({ name: opts.name ?? 'Icon', children: out });
}
