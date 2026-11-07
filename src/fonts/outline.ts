import { createGroup, createPath, type BezierPoint, type SceneNode, type SubPath, type TextNode } from '@/model';
import { autoOpsz, layoutText, type FaceChoice } from './layout';
import { coordsFor, type LoadedFont } from './parse';
import { ensureTextFont } from './store';
import { fontLineWidth } from './measure';
import { SYNTHETIC_ITALIC_SKEW } from './types';

/** opentype.js path command (SVG coordinates, y down). */
export type PathCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** Converts path commands to model subpaths (quadratics become cubics; handles are absolute). */
export function commandsToSubpaths(cmds: readonly PathCommand[]): SubPath[] {
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  const last = () => cur!.points[cur!.points.length - 1];
  const finish = () => {
    if (cur && cur.points.length) out.push(cur);
    cur = null;
  };
  for (const c of cmds) {
    if (c.type === 'M') {
      finish();
      cur = { points: [{ x: c.x, y: c.y, type: 'corner' }], closed: false };
      continue;
    }
    if (!cur) cur = { points: [{ x: 0, y: 0, type: 'corner' }], closed: false };
    if (c.type === 'L') {
      cur.points.push({ x: c.x, y: c.y, type: 'corner' });
    } else if (c.type === 'Q') {
      const p0 = last();
      p0.out = { x: p0.x + (2 / 3) * (c.x1 - p0.x), y: p0.y + (2 / 3) * (c.y1 - p0.y) };
      cur.points.push({ x: c.x, y: c.y, in: { x: c.x + (2 / 3) * (c.x1 - c.x), y: c.y + (2 / 3) * (c.y1 - c.y) }, type: 'corner' });
    } else if (c.type === 'C') {
      last().out = { x: c.x1, y: c.y1 };
      cur.points.push({ x: c.x, y: c.y, in: { x: c.x2, y: c.y2 }, type: 'corner' });
    } else if (c.type === 'Z') {
      const pts = cur.points;
      // Fonts usually repeat the start point before closing: merge it into the first point.
      if (pts.length > 1 && close(pts[0], pts[pts.length - 1])) {
        const end = pts.pop()!;
        if (end.in) pts[0].in = end.in;
      }
      cur.closed = true;
      finish();
    }
  }
  finish();
  return out.map((sp) => ({ ...sp, points: sp.points.map((p): BezierPoint => ({ ...p, type: p.in && p.out ? 'smooth' : 'corner' })) }));
}

/**
 * Glyph outlines for a text node with a loaded font, grouped per glyph (one compound path per glyph,
 * or a single compound path when the fill/stroke is a gradient so it spans the whole text).
 * Kerning, letter spacing, line height, alignment, variable weight/opsz and synthetic italic match
 * the canvas rendering. The group takes the text's transform, so it lands exactly where the text was.
 */
export function outlineWithFont(node: TextNode, font: LoadedFont, choice: FaceChoice): SceneNode {
  const layout = layoutText(node, choice.face.metrics, (line) => fontLineWidth(font, line, node, choice));
  const coords = coordsFor(font, choice.weight, autoOpsz(choice.face, node.fontSize));
  const s = node.fontSize / font.ot.unitsPerEm;
  const skew = choice.syntheticItalic ? SYNTHETIC_ITALIC_SKEW : 0;
  const glyphPaths: SubPath[][] = [];
  for (const line of layout.lines) {
    const glyphs = Array.from(line.text, (ch) => font.glyphFor(ch));
    let x = line.x;
    glyphs.forEach((g, i) => {
      const cmds = font.glyphPath(g, x, line.baseline, node.fontSize, coords).commands as PathCommand[];
      if (cmds.length) {
        const sk = skew
          ? cmds.map((c) => {
              const k = (px: number, py: number) => px - skew * (py - line.baseline);
              if (c.type === 'Z') return c;
              if (c.type === 'C') return { ...c, x1: k(c.x1, c.y1), x2: k(c.x2, c.y2), x: k(c.x, c.y) };
              if (c.type === 'Q') return { ...c, x1: k(c.x1, c.y1), x: k(c.x, c.y) };
              return { ...c, x: k(c.x, c.y) };
            })
          : cmds;
        const sp = commandsToSubpaths(sk);
        if (sp.length) glyphPaths.push(sp);
      }
      x += font.advance(g, coords) * s;
      if (i < glyphs.length - 1) x += font.kerning(g, glyphs[i + 1]) * s + node.letterSpacing;
    });
  }
  const paint = { fill: structuredClone(node.fill), stroke: structuredClone(node.stroke) };
  const gradient = node.fill.kind === 'linear' || node.fill.kind === 'radial' || node.stroke.paint.kind === 'linear' || node.stroke.paint.kind === 'radial';
  const children = gradient
    ? [createPath({ name: node.text.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Text', subpaths: glyphPaths.flat(), fillRule: 'nonzero', ...paint })]
    : glyphPaths.map((subpaths, i) => createPath({ name: `Glyph ${i + 1}`, subpaths, fillRule: 'nonzero', ...structuredClone(paint) }));
  return createGroup({
    name: node.name && node.name !== 'Text' ? node.name : node.text.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Text',
    children,
    transform: { ...node.transform },
    opacity: node.opacity,
    blendMode: node.blendMode,
    visible: node.visible,
    locked: node.locked,
  });
}

/**
 * Converts a text node into vector outlines: a group of paths with the text's transform.
 * Missing fonts use the fallback font (what the canvas shows). Exporters call this.
 */
export async function textToPaths(node: TextNode): Promise<SceneNode> {
  const { resolved, font } = await ensureTextFont(node);
  if (!font) throw new Error(`Could not load the font “${resolved.face.family}”.`);
  return outlineWithFont(node, font, resolved);
}
