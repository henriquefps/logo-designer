// Document (or selection) → clean standalone SVG. Serializes the model directly (never the canvas
// DOM): no editor metadata, hidden nodes skipped, gradients in one <defs> with short ids,
// numbers rounded to 3 decimals, text outlined when the fonts module provides textToPaths.
import {
  gradientVector,
  parentWorldMatrix,
  polygonVertices,
  selectionBounds,
  sortByDocumentOrder,
  splitColor,
  subpathsToD,
  topmostIds,
  translate,
  locate,
  type DesignDocument,
  type Id,
  type Matrix,
  type Paint,
  type PaintedNode,
  type Rect,
  type SceneNode,
  type TextNode,
  type Transform,
} from '@/model';
import { outlineText } from './outlineText';
import { transformSubpaths } from './svg/pathData';
import { isIdentity } from './svg/transformAttr';

export interface SvgExportOptions {
  scope?: 'artboard' | 'selection';
  /** Node ids for the selection scope. */
  selection?: Id[];
  /** Extra space around the selection bounds (document units). */
  padding?: number;
  /** Include the artboard background (default: true for artboard scope, false for selection). */
  background?: boolean;
  /** Convert text to paths through the fonts module (default true; falls back to <text>). */
  outlineText?: boolean;
  /** Every paint becomes `currentColor`, keeping its alpha (app icon glyphs). */
  currentColor?: boolean;
}

export interface SvgExportResult {
  svg: string;
  /** Output size in document units (artboard or padded selection bounds). */
  width: number;
  height: number;
  viewBox: Rect;
}

/** Number formatting: at most 3 decimals, no trailing zeros, no "-0". */
export function n(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Attrs = Record<string, string | number | undefined | null>;

function el(tag: string, attrs: Attrs, children?: string[], indent = ''): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : esc(v as string)}"`)
    .join('');
  if (!children || !children.length) return `${indent}<${tag}${a}/>`;
  return `${indent}<${tag}${a}>\n${children.join('\n')}\n${indent}</${tag}>`;
}

function transformAttr(t: Transform): string | undefined {
  const parts: string[] = [];
  if (t.x !== 0 || t.y !== 0) parts.push(`translate(${n(t.x)} ${n(t.y)})`);
  if (t.rotation !== 0) parts.push(`rotate(${n(t.rotation)})`);
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(t.scaleX === t.scaleY ? `scale(${n(t.scaleX)})` : `scale(${n(t.scaleX)} ${n(t.scaleY)})`);
  const s = parts.join(' ');
  return s === 'translate(0 0)' ? undefined : s || undefined;
}

const matrixAttr = (m: Matrix) => `matrix(${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)})`;

/** Only a translation (rotation 0, scale 1): geometry can absorb it. */
const translationOnly = (t: Transform) => t.rotation === 0 && t.scaleX === 1 && t.scaleY === 1;

class Writer {
  defs: string[] = [];
  private gradients = new Map<string, string>();
  private currentColor: boolean;
  constructor(currentColor = false) {
    this.currentColor = currentColor;
  }

  paint(p: Paint): { value: string; opacity?: number } {
    if (p.kind === 'none') return { value: 'none' };
    if (this.currentColor) {
      const alpha = p.kind === 'solid' ? splitColor(p.color).opacity : 1;
      return { value: 'currentColor', opacity: alpha < 1 ? alpha : undefined };
    }
    if (p.kind === 'solid') {
      const { color, opacity } = splitColor(p.color);
      return { value: color, opacity: opacity < 1 ? opacity : undefined };
    }
    const key = JSON.stringify(p);
    let id = this.gradients.get(key);
    if (!id) {
      id = `g${this.gradients.size + 1}`;
      this.gradients.set(key, id);
      const stops = p.stops.map((s) => {
        const { color, opacity } = splitColor(s.color);
        return el('stop', { offset: s.offset, 'stop-color': color, 'stop-opacity': opacity < 1 ? opacity : undefined }, undefined, '    ');
      });
      this.defs.push(
        p.kind === 'linear'
          ? el('linearGradient', { id, ...gradientVector(p.angle) }, stops, '  ')
          : el('radialGradient', { id, cx: 0.5, cy: 0.5, r: 0.5 }, stops, '  '),
      );
    }
    return { value: `url(#${id})` };
  }

  painted(node: PaintedNode): Attrs {
    const fill = this.paint(node.fill);
    const attrs: Attrs = {};
    // SVG's default fill is opaque black: omit it.
    if (!(fill.value === '#000000' && fill.opacity === undefined)) attrs.fill = fill.value;
    attrs['fill-opacity'] = fill.opacity;
    const s = node.stroke;
    if (s.paint.kind !== 'none' && s.width > 0) {
      const stroke = this.paint(s.paint);
      attrs.stroke = stroke.value;
      attrs['stroke-opacity'] = stroke.opacity;
      attrs['stroke-width'] = s.width === 1 ? undefined : s.width;
      attrs['stroke-linecap'] = s.cap === 'butt' ? undefined : s.cap;
      attrs['stroke-linejoin'] = s.join === 'miter' ? undefined : s.join;
      attrs['stroke-dasharray'] = s.dash.length ? s.dash.map(n).join(' ') : undefined;
    }
    return attrs;
  }

  common(node: SceneNode): Attrs {
    return {
      opacity: node.opacity < 1 ? node.opacity : undefined,
      style: node.blendMode && node.blendMode !== 'normal' ? `mix-blend-mode:${node.blendMode}` : undefined,
    };
  }

  async node(node: SceneNode, indent: string, outline: boolean): Promise<string | null> {
    if (!node.visible || node.reference) return null;
    const t = node.transform;
    const simple = translationOnly(t);
    const tr = simple ? undefined : transformAttr(t);
    switch (node.type) {
      case 'group': {
        const children = (await Promise.all(node.children.map((c) => this.node(c, indent + '  ', outline)))).filter((c): c is string => !!c);
        if (!children.length) return null;
        return el('g', { transform: transformAttr(t), ...this.common(node) }, children, indent);
      }
      case 'rect': {
        const r = Math.min(node.radius, node.width / 2, node.height / 2);
        return el(
          'rect',
          {
            x: (simple ? t.x : 0) - node.width / 2,
            y: (simple ? t.y : 0) - node.height / 2,
            width: node.width,
            height: node.height,
            rx: r > 0 ? r : undefined,
            transform: tr,
            ...this.painted(node),
            ...this.common(node),
          },
          undefined,
          indent,
        );
      }
      case 'ellipse': {
        const cx = simple ? t.x : 0;
        const cy = simple ? t.y : 0;
        const circle = node.rx === node.ry;
        return el(
          circle ? 'circle' : 'ellipse',
          {
            cx: cx || undefined,
            cy: cy || undefined,
            ...(circle ? { r: node.rx } : { rx: node.rx, ry: node.ry }),
            transform: tr,
            ...this.painted(node),
            ...this.common(node),
          },
          undefined,
          indent,
        );
      }
      case 'polygon': {
        const ox = simple ? t.x : 0;
        const oy = simple ? t.y : 0;
        const points = polygonVertices(node)
          .map((p) => `${n(p.x + ox)},${n(p.y + oy)}`)
          .join(' ');
        return el('polygon', { points, transform: tr, ...this.painted(node), ...this.common(node) }, undefined, indent);
      }
      case 'path': {
        const sp = simple && (t.x !== 0 || t.y !== 0) ? transformSubpaths(node.subpaths, translate(t.x, t.y)) : node.subpaths;
        const d = subpathsToD(sp);
        if (!d) return null;
        return el(
          'path',
          { d, 'fill-rule': node.fillRule === 'evenodd' ? 'evenodd' : undefined, transform: tr, ...this.painted(node), ...this.common(node) },
          undefined,
          indent,
        );
      }
      case 'image':
        return el(
          'image',
          {
            href: node.href,
            x: (simple ? t.x : 0) - node.width / 2,
            y: (simple ? t.y : 0) - node.height / 2,
            width: node.width,
            height: node.height,
            preserveAspectRatio: 'none',
            transform: tr,
            ...this.common(node),
          },
          undefined,
          indent,
        );
      case 'text': {
        if (outline) {
          const outlined = await outlineText(node);
          if (outlined) return this.node(outlined, indent, false);
        }
        return this.text(node, indent);
      }
    }
  }

  text(node: TextNode, indent: string): string {
    const lines = node.text.split('\n');
    const lh = node.fontSize * node.lineHeight;
    const firstBaseline = (lh - node.fontSize) / 2 + node.fontSize * 0.8;
    const anchor = node.align === 'center' ? 'middle' : node.align === 'right' ? 'end' : undefined;
    const spans = lines.map((line, i) => `${indent}  <tspan x="0" y="${n(firstBaseline + i * lh)}">${esc(line || ' ')}</tspan>`);
    return el(
      'text',
      {
        transform: transformAttr(node.transform),
        'font-family': node.fontFamily,
        'font-size': node.fontSize,
        'font-weight': node.fontWeight === 400 ? undefined : node.fontWeight,
        'font-style': node.fontStyle === 'italic' ? 'italic' : undefined,
        'letter-spacing': node.letterSpacing || undefined,
        'text-anchor': anchor,
        'xml:space': 'preserve',
        ...this.painted(node),
        ...this.common(node),
      },
      spans,
      indent,
    );
  }
}

/** The area an export covers: artboard, or selection bounds + padding. Null when the selection is empty. */
export function exportArea(doc: DesignDocument, opts: SvgExportOptions = {}): Rect | null {
  if (opts.scope !== 'selection') return { x: 0, y: 0, width: doc.artboard.width, height: doc.artboard.height };
  const ids = topmostIds(doc, opts.selection ?? []);
  const b = selectionBounds(doc, ids);
  if (!b) return null;
  const p = Math.max(0, opts.padding ?? 0);
  return { x: b.x - p, y: b.y - p, width: Math.max(b.width + 2 * p, 1e-3), height: Math.max(b.height + 2 * p, 1e-3) };
}

export async function exportSvg(doc: DesignDocument, opts: SvgExportOptions = {}): Promise<SvgExportResult> {
  const selectionScope = opts.scope === 'selection';
  const area = exportArea(doc, opts);
  if (!area) throw new Error('Nothing is selected.');
  const w = new Writer(opts.currentColor);
  const outline = opts.outlineText !== false;
  const body: string[] = [];

  const background = opts.background ?? !selectionScope;
  if (background && doc.artboard.background.kind !== 'none') {
    const bg = w.paint(doc.artboard.background);
    body.push(el('rect', { width: doc.artboard.width, height: doc.artboard.height, fill: bg.value, 'fill-opacity': bg.opacity }, undefined, '  '));
  }

  if (selectionScope) {
    const ids = sortByDocumentOrder(doc, topmostIds(doc, opts.selection ?? []));
    for (const id of ids) {
      const node = locate(doc, id)?.node;
      if (!node) continue;
      const m = parentWorldMatrix(doc, id);
      if (isIdentity(m)) {
        const s = await w.node(node, '  ', outline);
        if (s) body.push(s);
      } else {
        const s = await w.node(node, '    ', outline);
        if (s) body.push(el('g', { transform: matrixAttr(m) }, [s], '  '));
      }
    }
  } else {
    for (const node of doc.children) {
      const s = await w.node(node, '  ', outline);
      if (s) body.push(s);
    }
  }

  const children = [...(w.defs.length ? [el('defs', {}, w.defs, '  ')] : []), ...body];
  const svg =
    el(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: area.width,
        height: area.height,
        viewBox: `${n(area.x)} ${n(area.y)} ${n(area.width)} ${n(area.height)}`,
      },
      children,
    ) + '\n';
  return { svg, width: area.width, height: area.height, viewBox: area };
}

