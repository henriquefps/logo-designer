// The lo-fi drawing kit for component `build()` functions (docs/architecture.md → Wireframe mode →
// Adding a component). Every helper takes the TOP-LEFT corner of what it draws, in the instance's
// local space (origin = the instance's top-left), and returns one node. Colours, font, sizes and
// strokes come from ./style.ts, so every component looks like the same wireframe kit.
//
// Pure (no React, no stores): the pipeline and the CLI run it.
import { createEllipse, createGroup, createPath, createRect, createText, defaultStroke, measureText, none, solid, type BezierPoint, type Paint, type SceneNode, type Stroke, type SubPath, type TextNode } from '@/model';
import { ICON_GLYPH_SIZE, iconGlyph, iconNodeName, normalizeIconName, recolor } from './icons';
import { WF, WF_RADIUS, WF_SIZE, WF_TEXT, type WfTextStyle, type WfTone } from './style';

const color = (t: WfTone) => WF[t];
const paint = (t: WfTone | 'none'): Paint => (t === 'none' ? none() : solid(color(t)));
const line = (t: WfTone | 'none' = 'line', width: number = WF.strokeWidth): Stroke =>
  t === 'none' ? defaultStroke() : { ...defaultStroke(solid(color(t)), width), cap: 'round', join: 'round' };

const pt = (x: number, y: number): BezierPoint => ({ x, y, type: 'corner' });

// ---------- primitives ----------

export interface BoxOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius (clamped to half the shorter side; `WF_RADIUS.pill` = fully round ends). */
  radius?: number;
  fill?: WfTone | 'none';
  stroke?: WfTone | 'none';
  name?: string;
}

/** A rectangle. Default: white with a light outline. */
export function box(o: BoxOptions): SceneNode {
  const r = Math.max(0, Math.min(o.radius ?? 0, o.width / 2, o.height / 2));
  return createRect({
    name: o.name ?? 'Box',
    width: o.width,
    height: o.height,
    radius: r,
    transform: { x: o.x + o.width / 2, y: o.y + o.height / 2 },
    fill: paint(o.fill ?? 'paper'),
    stroke: line(o.stroke ?? 'line'),
  });
}

/** A circle (avatars, radio buttons, dots). `x`, `y` = top-left of its box. */
export function circle(o: { x: number; y: number; size: number; fill?: WfTone | 'none'; stroke?: WfTone | 'none'; name?: string }): SceneNode {
  const r = o.size / 2;
  return createEllipse({ name: o.name ?? 'Circle', rx: r, ry: r, transform: { x: o.x + r, y: o.y + r }, fill: paint(o.fill ?? 'fill'), stroke: line(o.stroke ?? 'none') });
}

/** An open or closed polyline (1 px, round caps). */
export function polyline(points: { x: number; y: number }[], o: { closed?: boolean; stroke?: WfTone; width?: number; fill?: WfTone | 'none'; name?: string } = {}): SceneNode {
  return createPath({
    name: o.name ?? 'Line',
    subpaths: [{ closed: !!o.closed, points: points.map((p) => pt(p.x, p.y)) }],
    fill: paint(o.fill ?? 'none'),
    stroke: line(o.stroke ?? 'line', o.width),
  });
}

/** A horizontal hairline (or vertical with `vertical: true`, then `width` is its length). */
export function divider(o: { x: number; y: number; width: number; vertical?: boolean; tone?: WfTone }): SceneNode {
  const end = o.vertical ? { x: o.x, y: o.y + o.width } : { x: o.x + o.width, y: o.y };
  return polyline([{ x: o.x, y: o.y }, end], { stroke: o.tone ?? 'line', name: 'Divider' });
}

/** A group of nodes (to name a part, e.g. 'Trailing'). Children keep their coordinates. */
export const part = (name: string, children: SceneNode[]): SceneNode => createGroup({ name, children });

// ---------- text ----------

export interface TextOptions {
  x: number;
  y: number;
  style?: WfTextStyle;
  tone?: WfTone;
  /** Overrides the style's weight. */
  weight?: number;
  /** `x` is the left edge, the centre or the right edge. */
  align?: 'left' | 'center' | 'right';
  name?: string;
}

/** Height of one line of a text style. */
export const lineHeight = (style: WfTextStyle = 'body') => WF_TEXT[style].size * WF_TEXT[style].lineHeight;

/** Real text (labels, titles, values). `y` = top of the first line; `\n` starts a new line. */
export function text(value: string, o: TextOptions): TextNode {
  const s = WF_TEXT[o.style ?? 'body'];
  return createText({
    name: o.name ?? 'Text',
    text: value,
    fontFamily: WF.font,
    fontSize: s.size,
    fontWeight: o.weight ?? s.weight,
    lineHeight: s.lineHeight,
    align: o.align ?? 'left',
    fill: solid(color(o.tone ?? 'ink')),
    transform: { x: o.x, y: o.y },
  });
}

/** Width of a text as `text()` would draw it (real Inter metrics in the app, an estimate in the CLI). */
export function textWidth(value: string, style: WfTextStyle = 'body', weight?: number): number {
  return measureText(text(value, { x: 0, y: 0, style, weight })).width;
}

/** `value` shortened with an ellipsis so one line fits in `maxWidth` (unchanged when it fits). */
export function truncate(value: string, maxWidth: number, style: WfTextStyle = 'body', weight?: number): string {
  if (maxWidth <= 0) return '';
  if (textWidth(value, style, weight) <= maxWidth) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(value.slice(0, mid).trimEnd() + '…', style, weight) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo ? value.slice(0, lo).trimEnd() + '…' : '';
}

/** Height of a text block (number of lines × line height). */
export const textHeight = (value: string, style: WfTextStyle = 'body') => Math.max(1, value.split('\n').length) * lineHeight(style);

/** One line of text centred vertically in the band `y..y+height`. */
export function textInBand(value: string, o: TextOptions & { height: number }): TextNode {
  return text(value, { ...o, y: o.y + (o.height - lineHeight(o.style)) / 2 });
}

/**
 * Text that is not real content: grey bars, one per line (the last one shorter). Use for body copy,
 * descriptions, anything where the words do not matter.
 */
export function textBars(o: { x: number; y: number; width: number; lines: number; style?: WfTextStyle; name?: string }): SceneNode {
  const lh = lineHeight(o.style);
  const barH = Math.round(WF_TEXT[o.style ?? 'body'].size * 0.6);
  const n = Math.max(1, Math.round(o.lines));
  const bars = Array.from({ length: n }, (_, i) =>
    box({ x: o.x, y: o.y + i * lh + (lh - barH) / 2, width: i === n - 1 && n > 1 ? o.width * 0.6 : o.width, height: barH, radius: barH / 2, fill: 'fill', stroke: 'none', name: 'Bar' }),
  );
  return part(o.name ?? 'Text bars', bars);
}

/** Height `textBars` takes for `lines` lines. */
export const textBarsHeight = (lines: number, style: WfTextStyle = 'body') => Math.max(1, Math.round(lines)) * lineHeight(style);

// ---------- placeholders ----------

/** An image: a grey box with an X. */
export function imagePlaceholder(o: { x: number; y: number; width: number; height: number; radius?: number; name?: string }): SceneNode {
  const { x, y, width: w, height: h } = o;
  return part(o.name ?? 'Image', [
    box({ x, y, width: w, height: h, radius: o.radius, fill: 'fill', stroke: 'line', name: 'Frame' }),
    createPath({
      name: 'Cross',
      fill: none(),
      stroke: line('line'),
      subpaths: [
        { closed: false, points: [pt(x, y), pt(x + w, y + h)] },
        { closed: false, points: [pt(x + w, y), pt(x, y + h)] },
      ],
    }),
  ]);
}

/** An avatar: a grey circle with a head-and-shoulders silhouette. */
export function avatar(o: { x: number; y: number; size?: number; name?: string }): SceneNode {
  const s = o.size ?? WF_SIZE.avatar;
  const head = s * 0.36;
  const shoulders: SubPath = {
    closed: true,
    points: [pt(o.x + s * 0.2, o.y + s * 0.86), pt(o.x + s * 0.3, o.y + s * 0.66), pt(o.x + s * 0.7, o.y + s * 0.66), pt(o.x + s * 0.8, o.y + s * 0.86)],
  };
  return part(o.name ?? 'Avatar', [
    circle({ x: o.x, y: o.y, size: s, fill: 'fill', name: 'Circle' }),
    circle({ x: o.x + (s - head) / 2, y: o.y + s * 0.2, size: head, fill: 'paper', name: 'Head' }),
    createPath({ name: 'Shoulders', subpaths: [shoulders], fill: paint('paper'), stroke: line('none') }),
  ]);
}

// ---------- icons and glyphs ----------

/**
 * An icon from the app's libraries (a component's `icon` prop): `x`, `y` = top-left of a `size` box.
 * Drawn as a placeholder (a dashed rounded square) until the glyph is loaded; see ./icons.ts.
 * Returns null for '' (no icon), so `icon(props.icon, …)` can be spread with `?? []` logic.
 */
export function icon(name: string, o: { x: number; y: number; size?: number; tone?: WfTone }): SceneNode | null {
  const key = normalizeIconName(name);
  if (!key) return null;
  const size = o.size ?? WF_SIZE.icon;
  const tone = o.tone ?? 'ink';
  const glyph = iconGlyph(key);
  if (glyph) {
    const k = size / ICON_GLYPH_SIZE;
    return createGroup({ name: iconNodeName(key, true), transform: { x: o.x + size / 2, y: o.y + size / 2, scaleX: k, scaleY: k }, children: [recolor(glyph, color(tone))] });
  }
  const inset = size * 0.12;
  const ph = box({ x: o.x + inset, y: o.y + inset, width: size - inset * 2, height: size - inset * 2, radius: size * 0.2, fill: 'none', stroke: tone, name: 'Placeholder' });
  if (ph.type === 'rect') ph.stroke = { ...ph.stroke, dash: [2, 2] };
  return createGroup({ name: iconNodeName(key, false), children: [ph] });
}

/** A chevron (›) in a `size` box: right (rows, disclosure), left (back), down (selects), up. */
export function chevron(o: { x: number; y: number; size?: number; direction?: 'right' | 'left' | 'down' | 'up'; tone?: WfTone }): SceneNode {
  const s = o.size ?? WF_SIZE.icon;
  const a = s * 0.18;
  const b = s * 0.34;
  const cx = o.x + s / 2;
  const cy = o.y + s / 2;
  const pts = {
    right: [{ x: cx - a, y: cy - b }, { x: cx + a, y: cy }, { x: cx - a, y: cy + b }],
    left: [{ x: cx + a, y: cy - b }, { x: cx - a, y: cy }, { x: cx + a, y: cy + b }],
    down: [{ x: cx - b, y: cy - a }, { x: cx, y: cy + a }, { x: cx + b, y: cy - a }],
    up: [{ x: cx - b, y: cy + a }, { x: cx, y: cy - a }, { x: cx + b, y: cy + a }],
  }[o.direction ?? 'right'];
  return polyline(pts, { stroke: o.tone ?? 'inkMuted', width: 1.5, name: 'Chevron' });
}

/** Switch size: 40 × 24. */
export const TOGGLE = { width: 40, height: 24 } as const;

/** A switch (on = dark track, knob right). */
export function toggle(o: { x: number; y: number; on?: boolean }): SceneNode {
  const on = o.on ?? true;
  const knob = TOGGLE.height - 6;
  return part('Toggle', [
    box({ x: o.x, y: o.y, width: TOGGLE.width, height: TOGGLE.height, radius: WF_RADIUS.pill, fill: on ? 'ink' : 'fill', stroke: on ? 'none' : 'line', name: 'Track' }),
    circle({ x: on ? o.x + TOGGLE.width - knob - 3 : o.x + 3, y: o.y + 3, size: knob, fill: 'paper', stroke: on ? 'none' : 'line', name: 'Knob' }),
  ]);
}

/** A checkbox (`size` square, default 20). */
export function checkbox(o: { x: number; y: number; checked?: boolean; size?: number }): SceneNode {
  const s = o.size ?? 20;
  const checked = o.checked ?? true;
  const children = [box({ x: o.x, y: o.y, width: s, height: s, radius: WF_RADIUS.sm, fill: checked ? 'ink' : 'paper', stroke: checked ? 'none' : 'inkMuted', name: 'Box' })];
  if (checked) {
    children.push(
      polyline(
        [
          { x: o.x + s * 0.25, y: o.y + s * 0.52 },
          { x: o.x + s * 0.43, y: o.y + s * 0.7 },
          { x: o.x + s * 0.76, y: o.y + s * 0.32 },
        ],
        { stroke: 'paper', width: 2, name: 'Check' },
      ),
    );
  }
  return part('Checkbox', children);
}

/** A radio button (`size` circle, default 20). */
export function radio(o: { x: number; y: number; selected?: boolean; size?: number }): SceneNode {
  const s = o.size ?? 20;
  const children = [circle({ x: o.x, y: o.y, size: s, fill: 'paper', stroke: 'inkMuted', name: 'Ring' })];
  if (o.selected ?? true) children.push(circle({ x: o.x + s * 0.25, y: o.y + s * 0.25, size: s * 0.5, fill: 'ink', name: 'Dot' }));
  return part('Radio', children);
}

/** Keeps only nodes (drops the nulls `icon('')` returns). */
export const nodes = (...list: (SceneNode | null | undefined | false | '')[]): SceneNode[] => list.filter((n): n is SceneNode => !!n);
