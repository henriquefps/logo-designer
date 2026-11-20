// `designer wf sheet` and `designer wf compare` (docs/wireframe-mode.md → Phase 3 → A3): looking at
// the result. The sheet is one image of every frame laid out as on the canvas, with names, platform,
// status badges and flow arrows; compare puts a screenshot next to the rendered frame for the
// "look, fix, render again" loop. Both render through the CLI renderer (resvg, outlined text), like
// `to-png`. Layout and scaling are pure functions (tested without rendering); the renderers compose
// one SVG (frames as embedded PNGs, overlay shapes as markup, text outlined by the fonts module).
import { cliSvg } from './sandbox';
import { createDocument, createText, findNode, solid, worldBounds, type DesignDocument, type Rect, type ScreenNode, type ScreenPlatform, type Vec } from '@/model';
import { exportSvg } from '@/io/svgExport';
import { bezierAt, flowCurves, flowsOf, flowTarget, screenStatus, STATUS_LABELS } from '@/wireframe/flows';
import { arrowHead } from '@/wireframe/canvas/arrowHead';
import { labelLayout, labelWidth } from '@/wireframe/canvas/labels';
import { frameOf, frameRect, screenSlug } from '@/wireframe/screens';
import { noteRect, notesOf, type NoteNode } from '@/wireframe/notes';
import { WF } from '@/wireframe/style';
import { framesFor, parsePlatform } from './wireframe';

/** A usage error (exit 2); main.ts turns it into its own UsageError. */
export class WfUsageError extends Error {}

export const DEFAULT_MAX = 4096;
const MAX_MAX = 16384;
const CANVAS_BG = '#ececec';
const INK = WF.ink;
/** Margin around the content, in output px. */
const MARGIN = 32;

// ---------- arguments ----------

type Values = Record<string, string | boolean | undefined>;

function num(values: Values, key: string, lo: number, hi: number, what: string): number | undefined {
  const v = values[key];
  if (v === undefined) return undefined;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < lo || n > hi) throw new WfUsageError(`--${key} must be ${what} (got “${String(v)}”)`);
  return n;
}

export interface SheetArgs {
  platform?: ScreenPlatform;
  notes: boolean;
  scale: number;
  max: number;
}

export function parseSheetArgs(values: Values): SheetArgs {
  return {
    platform: parsePlatformArg(values.platform),
    notes: !!values.notes,
    scale: num(values, 'scale', 0.01, 16, 'a number between 0.01 and 16') ?? 1,
    max: num(values, 'max', 64, MAX_MAX, `a size in px between 64 and ${MAX_MAX}`) ?? DEFAULT_MAX,
  };
}

export interface CompareArgs {
  screen: string;
  platform?: ScreenPlatform;
  scale: number;
  max: number;
  /** Frame spacing of the grid in frame px (design px at 1×); undefined = no grid. */
  grid?: number;
  /** 0..100: percentage of the frame blended over the screenshot in the extra overlay panel; undefined = no overlay. */
  overlay?: number;
}

export function parseCompareArgs(values: Values): CompareArgs {
  const screen = typeof values.screen === 'string' ? values.screen : undefined;
  if (!screen) throw new WfUsageError('wf compare needs --screen <name>');
  return {
    screen,
    platform: parsePlatformArg(values.platform),
    scale: num(values, 'scale', 0.01, 16, 'a number between 0.01 and 16') ?? 1,
    max: num(values, 'max', 64, MAX_MAX, `a size in px between 64 and ${MAX_MAX}`) ?? DEFAULT_MAX,
    grid: num(values, 'grid', 1, 4096, 'a spacing in px (1..4096)'),
    overlay: num(values, 'overlay', 0, 100, 'a percentage between 0 and 100'),
  };
}

function parsePlatformArg(v: string | boolean | undefined): ScreenPlatform | undefined {
  try {
    return parsePlatform(typeof v === 'string' ? v : undefined);
  } catch (e) {
    throw new WfUsageError(e instanceof Error ? e.message : String(e));
  }
}

// ---------- sheet layout ----------

export interface SheetFrame {
  frame: ScreenNode;
  /** Output px. */
  rect: Rect;
  name: string;
  detail: string;
  /** The status badge text, when it fits. */
  badge: string | null;
  status?: string;
}

export interface SheetArrow {
  flowId: string;
  /** Bézier points in output px and the end direction. */
  points: [Vec, Vec, Vec, Vec];
  dir: Vec;
  label?: string;
}

export interface SheetNote {
  note: NoteNode;
  rect: Rect;
  /** The attached element, in output px (absent: a free note). */
  target?: Rect;
}

export interface SheetLayout {
  width: number;
  height: number;
  /** Output px per document unit. */
  scale: number;
  /** Font size of the labels, output px. */
  labelSize: number;
  frames: SheetFrame[];
  arrows: SheetArrow[];
  notes: SheetNote[];
}

/**
 * Output px per document unit for content of `w × h` units plus `extraW` px of gaps: `scale`, reduced
 * so the whole image (margins and the label strip included, which are output px) fits `max` px.
 */
export function solveScale(w: number, h: number, extraW: number, scale: number, max: number): { scale: number; labelSize: number; strip: number } {
  let s = scale;
  let labelSize = labelSizeFor(Math.max(w, h) * s);
  let strip = Math.round(labelSize * 2);
  for (let i = 0; i < 5; i++) {
    s = Math.min(scale, (max - 2 * MARGIN - extraW) / w, (max - strip - 2 * MARGIN) / h);
    labelSize = labelSizeFor(Math.max(w, h) * s);
    strip = Math.round(labelSize * 2);
  }
  return { scale: s, labelSize, strip };
}

/** The label font size for an image whose long side is `long` px: readable at any size. */
export const labelSizeFor = (long: number) => Math.max(14, Math.round(long / 160));

/** The sheet's geometry: where every frame, label, arrow and note goes. Throws when no frame matches. */
export function sheetLayout(doc: DesignDocument, args: Pick<SheetArgs, 'platform' | 'notes' | 'scale' | 'max'>): SheetLayout {
  const shown = framesFor(doc, undefined, args.platform).filter((f) => f.visible);
  if (!shown.length) throw new Error(args.platform ? `no ${args.platform} screens in this project` : 'this wireframe has no visible screens');
  const noteList = args.notes ? notesOf(doc).filter((n) => n.visible) : [];

  // Content bounds in document space (the label strip above each frame is sized after the scale is known).
  const boxes: Rect[] = [...shown.map(frameRect), ...noteList.map(noteRect)];
  const minX = Math.min(...boxes.map((r) => r.x));
  const minY = Math.min(...boxes.map((r) => r.y));
  const maxX = Math.max(...boxes.map((r) => r.x + r.width));
  const maxY = Math.max(...boxes.map((r) => r.y + r.height));
  const docW = maxX - minX;
  const docH = maxY - minY;

  const { scale, labelSize, strip } = solveScale(docW, docH, 0, args.scale, args.max);
  const margin = MARGIN;
  const px = (r: Rect): Rect => ({ x: margin + (r.x - minX) * scale, y: margin + strip + (r.y - minY) * scale, width: r.width * scale, height: r.height * scale });
  const pt = (p: Vec): Vec => ({ x: margin + (p.x - minX) * scale, y: margin + strip + (p.y - minY) * scale });

  const sheetFrames: SheetFrame[] = shown.map((f) => {
    const rect = px(frameRect(f));
    const status = screenStatus(doc, f.screen.screenId);
    const badgeText = status ? STATUS_LABELS[status] : null;
    // Same fitting rules as the canvas labels, at the label size (the canvas draws 12 px labels).
    const k = labelSize / 12;
    const badgeW = badgeText && rect.width > 90 * k ? Math.ceil(labelWidth(badgeText, 500) * (10 / 12) * k) + 12 * k : 0;
    const layout = labelLayout(f.name, PLATFORM_LABELS[f.screen.platform], Math.round(f.screen.width), rect.width / k, badgeW / k);
    return { frame: f, rect, name: layout.name, detail: layout.detail, badge: layout.badge ? badgeText : null, ...(status ? { status } : {}) };
  });

  const shownIds = new Set(shown.map((f) => f.id));
  const arrows: SheetArrow[] = [];
  for (const flow of flowsOf(doc)) {
    // One arrow per source (a flow defined in a shared component's master starts on every instance), from its part.
    for (const { source, curve: c } of flowCurves(doc, flow)) {
      const origin = frameOf(doc, source);
      const target = flowTarget(doc, flow, origin);
      if (!origin || !target || !shownIds.has(origin.id) || !shownIds.has(target.id)) continue;
      const [a, b, cc, d] = c.points.map(pt) as SheetArrow['points'];
      arrows.push({ flowId: flow.id, points: [a, b, cc, d], dir: c.dir, ...(flow.label ? { label: flow.label } : {}) });
    }
  }

  const notes: SheetNote[] = noteList.map((note) => {
    const t = note.note.target ? (findNode(doc, note.note.target) ? worldBounds(doc, note.note.target) : null) : null;
    return { note, rect: px(noteRect(note)), ...(t ? { target: px(t) } : {}) };
  });

  const width = Math.ceil(2 * margin + docW * scale);
  const height = Math.ceil(2 * margin + strip + docH * scale);
  return { width, height, scale, labelSize, frames: sheetFrames, arrows, notes };
}

const PLATFORM_LABELS: Record<ScreenPlatform, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' };

// ---------- compare layout ----------

export interface ComparePanel {
  kind: 'screenshot' | 'frame' | 'overlay';
  label: string;
  /** Output px. */
  rect: Rect;
}

export interface CompareLayout {
  width: number;
  height: number;
  /** Output px per frame px. */
  scale: number;
  labelSize: number;
  panels: ComparePanel[];
  /** Screenshot height at the frame's width (frame px). */
  shotHeight: number;
  frameWidth: number;
  frameHeight: number;
}

/**
 * Screenshot and frame side by side at the frame's width: the screenshot is scaled to it keeping
 * its aspect, panels are top-aligned, an overlay panel (screenshot under the frame at `overlay` %)
 * comes third. Everything is then scaled by `scale`, reduced to fit `max` on the long side.
 */
export function compareLayout(shot: { width: number; height: number }, frame: { width: number; height: number; name: string; platform: string }, args: Pick<CompareArgs, 'scale' | 'max' | 'overlay'>): CompareLayout {
  const shotHeight = (shot.height * frame.width) / shot.width;
  const n = args.overlay === undefined ? 2 : 3;
  const gap = 24;
  const panelH = Math.max(frame.height, shotHeight);
  const docW = n * frame.width + (n - 1) * gap;
  const margin = MARGIN;
  const { scale, labelSize, strip } = solveScale(docW, panelH, (n - 1) * gap, args.scale, args.max);
  const pw = frame.width * scale;
  const ph = panelH * scale;
  const rectOf = (i: number): Rect => ({ x: margin + i * (pw + gap), y: margin + strip, width: pw, height: ph });
  const detail = `${frame.name} · ${frame.platform} ${Math.round(frame.width)}`;
  const panels: ComparePanel[] = [
    { kind: 'screenshot', label: `Screenshot (${Math.round(shot.width)}×${Math.round(shot.height)} → ${Math.round(frame.width)} wide)`, rect: rectOf(0) },
    { kind: 'frame', label: `Wireframe · ${detail}`, rect: rectOf(1) },
  ];
  if (args.overlay !== undefined) panels.push({ kind: 'overlay', label: `Overlay · wireframe ${Math.round(args.overlay)}%`, rect: rectOf(2) });
  return {
    width: Math.ceil(2 * margin + n * pw + (n - 1) * gap),
    height: Math.ceil(2 * margin + strip + ph),
    scale,
    labelSize,
    panels,
    shotHeight,
    frameWidth: frame.width,
    frameHeight: frame.height,
  };
}

// ---------- image helpers ----------

/** Pixel size of a PNG or JPEG file; null when it is neither. */
export function imageSize(b: Uint8Array): { width: number; height: number; mime: string } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && v.getUint32(0) === 0x89504e47) return { width: v.getUint32(16), height: v.getUint32(20), mime: 'image/png' };
  if (b.length > 4 && v.getUint16(0) === 0xffd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: v.getUint16(i + 5), width: v.getUint16(i + 7), mime: 'image/jpeg' };
      i += 2 + v.getUint16(i + 2);
    }
  }
  return null;
}

const dataUrl = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
/** Width of `text` at `size` px (the canvas estimate, a little generous so neighbours never touch). */
const textWidth = (text: string, weight: number, size: number) => labelWidth(text, weight) * (size / 12) * 1.15;
const f = (n: number) => String(Math.round(n * 100) / 100);

async function renderPng(svg: string, width: number): Promise<Uint8Array> {
  const { Resvg } = await import('@resvg/resvg-js');
  return new Uint8Array(new Resvg(cliSvg(process.env, svg), { fitTo: { mode: 'width', value: Math.max(1, Math.round(width)) }, font: { loadSystemFonts: false } }).render().asPng());
}

/** A rendered frame as a PNG `width` px wide. */
async function framePng(doc: DesignDocument, frame: ScreenNode, width: number): Promise<Uint8Array> {
  const { svg } = await exportSvg(doc, { scope: 'screen', screenId: frame.id });
  return renderPng(svg, width);
}

// ---------- text (outlined through the fonts module) ----------

interface Label {
  text: string;
  x: number;
  y: number;
  size: number;
  weight?: number;
  color?: string;
  /** Where `x` is: the left edge (default) or the centre of the text. */
  anchor?: 'start' | 'middle';
  /** Vertical: `y` is the middle of the line (default) or its top. */
  rowMiddle?: boolean;
}

/** Text → outlined path markup for a whole image (every label of the image in one pass). */
async function outlinedLabels(labels: Label[], width: number, height: number): Promise<string> {
  if (!labels.length) return '';
  const nodes = labels.map((l) => {
    const w = textWidth(l.text, l.weight ?? 400, l.size);
    return createText({
      text: l.text,
      fontFamily: 'Inter Variable',
      fontSize: l.size,
      fontWeight: l.weight ?? 400,
      lineHeight: 1,
      fill: solid(l.color ?? INK),
      transform: { x: l.anchor === 'middle' ? l.x - w / 2 : l.x, y: l.y - l.size / 2 },
    });
  });
  const tmp = createDocument({ artboard: { width, height, background: { kind: 'none' } }, children: nodes });
  const { svg } = await exportSvg(tmp, { outlineText: true });
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

const svgOpen = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;

// ---------- sheet ----------

export async function renderSheet(doc: DesignDocument, args: SheetArgs): Promise<{ png: Uint8Array; layout: SheetLayout }> {
  const L = sheetLayout(doc, args);
  const out: string[] = [svgOpen(L.width, L.height), `<rect width="${L.width}" height="${L.height}" fill="${CANVAS_BG}"/>`];
  const labels: Label[] = [];
  const s = L.labelSize;

  // Notes sit under the frames (like the canvas), their connectors under the notes.
  for (const n of L.notes) {
    if (!n.target) continue;
    const a = { x: n.rect.x + n.rect.width / 2, y: n.rect.y + n.rect.height / 2 };
    const b = { x: n.target.x + n.target.width / 2, y: n.target.y + n.target.height / 2 };
    out.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${WF.noteLine}" stroke-width="${f(Math.max(1, s / 10))}" stroke-dasharray="${f(s / 3)} ${f(s / 4)}"/>`);
  }

  for (const fr of L.frames) {
    const png = await framePng(doc, fr.frame, fr.rect.width);
    out.push(`<image x="${f(fr.rect.x)}" y="${f(fr.rect.y)}" width="${f(fr.rect.width)}" height="${f(fr.rect.height)}" preserveAspectRatio="none" xlink:href="${dataUrl(png, 'image/png')}"/>`);
    out.push(`<rect x="${f(fr.rect.x - 0.5)}" y="${f(fr.rect.y - 0.5)}" width="${f(fr.rect.width + 1)}" height="${f(fr.rect.height + 1)}" fill="none" stroke="${WF.frame}" stroke-width="1"/>`);
    // Name and platform above the frame, the badge right-aligned on the same strip.
    const cy = fr.rect.y - s * 0.9;
    let x = fr.rect.x;
    if (fr.name) {
      labels.push({ text: fr.name, x, y: cy, size: s, weight: 500 });
      x += textWidth(fr.name, 500, s) + (fr.detail ? s / 2 : 0);
    }
    if (fr.detail) labels.push({ text: fr.detail, x, y: cy, size: s, color: WF.inkMuted });
    if (fr.badge && fr.status) {
      const bs = (s * 10) / 12;
      const bw = Math.ceil(textWidth(fr.badge, 500, bs)) + s;
      const bh = s * 1.25;
      const bx = fr.rect.x + fr.rect.width - bw;
      const by = cy - bh / 2;
      const fill = fr.status === 'current' ? '#ffffff' : fr.status === 'changed' ? INK : 'none';
      const dash = fr.status === 'new' ? ` stroke-dasharray="${f(s / 4)} ${f(s / 6)}"` : '';
      out.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="${f(bh / 2)}" fill="${fill}" stroke="${INK}" stroke-width="1"${dash}/>`);
      labels.push({ text: fr.badge, x: bx + bw / 2, y: cy, size: bs, weight: 600, anchor: 'middle', color: fr.status === 'changed' ? '#ffffff' : INK });
    }
  }

  for (const n of L.notes) {
    const { svg } = await exportSvg(doc, { scope: 'selection', selection: [n.note.id] });
    const png = await renderPng(svg, n.rect.width);
    out.push(`<image x="${f(n.rect.x)}" y="${f(n.rect.y)}" width="${f(n.rect.width)}" height="${f(n.rect.height)}" preserveAspectRatio="none" xlink:href="${dataUrl(png, 'image/png')}"/>`);
  }

  // Flow arrows over the frames: the same curves and arrowheads as the canvas overlay.
  const sw = f(Math.max(1.5, s / 8));
  for (const a of L.arrows) {
    const [p0, p1, p2, p3] = a.points;
    out.push(`<g opacity="0.75" fill="none"><path d="M${f(p0.x)},${f(p0.y)} C${f(p1.x)},${f(p1.y)} ${f(p2.x)},${f(p2.y)} ${f(p3.x)},${f(p3.y)}" stroke="${INK}" stroke-width="${sw}"/>`);
    out.push(`<circle cx="${f(p0.x)}" cy="${f(p0.y)}" r="${f(s / 4)}" fill="${INK}"/><path d="${arrowHead(p3, a.dir, s * 0.75).replace(/-?\d+(\.\d+)?/g, (m) => f(Number(m)))}" fill="${INK}"/></g>`);
    if (a.label) {
      const mid = bezierAt(a.points, 0.5);
      const w = textWidth(a.label, 400, s) + s;
      out.push(`<rect x="${f(mid.x - w / 2)}" y="${f(mid.y - s * 0.8)}" width="${f(w)}" height="${f(s * 1.6)}" rx="${f(s * 0.8)}" fill="#ffffff" stroke="${INK}" stroke-width="1" opacity="0.9"/>`);
      labels.push({ text: a.label, x: mid.x, y: mid.y, size: s, anchor: 'middle' });
    }
  }

  out.push(await outlinedLabels(labels, L.width, L.height), '</svg>');
  return { png: await renderPng(out.join('\n'), L.width), layout: L };
}

// ---------- compare ----------

/** Thin grid lines every `step` frame px over a panel (output px rect). */
function gridMarkup(panel: Rect, step: number, scale: number): string {
  const d: string[] = [];
  const stepPx = step * scale;
  if (stepPx < 2) return '';
  for (let x = stepPx; x < panel.width - 0.01; x += stepPx) d.push(`M${f(panel.x + x)},${f(panel.y)}V${f(panel.y + panel.height)}`);
  for (let y = stepPx; y < panel.height - 0.01; y += stepPx) d.push(`M${f(panel.x)},${f(panel.y + y)}H${f(panel.x + panel.width)}`);
  return d.length ? `<path d="${d.join('')}" stroke="#e5484d" stroke-opacity="0.35" stroke-width="0.5" fill="none"/>` : '';
}

export async function renderCompare(
  doc: DesignDocument,
  frame: ScreenNode,
  shotBytes: Uint8Array,
  args: CompareArgs,
): Promise<{ png: Uint8Array; layout: CompareLayout }> {
  const size = imageSize(shotBytes);
  if (!size) throw new Error('the screenshot must be a PNG or JPEG image');
  const L = compareLayout(size, { width: frame.screen.width, height: frame.screen.height, name: frame.name, platform: frame.screen.platform }, args);
  const out: string[] = [svgOpen(L.width, L.height), `<rect width="${L.width}" height="${L.height}" fill="${CANVAS_BG}"/>`];
  const labels: Label[] = [];
  const shotUrl = dataUrl(shotBytes, size.mime);
  const frameUrl = dataUrl(await framePng(doc, frame, L.frameWidth * L.scale), 'image/png');
  const shotH = L.shotHeight * L.scale;
  const frameH = L.frameHeight * L.scale;
  for (const p of L.panels) {
    const { x, y, width } = p.rect;
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${f(p.rect.height)}" fill="#ffffff"/>`);
    const shot = `<image x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${f(shotH)}" preserveAspectRatio="none" xlink:href="${shotUrl}"/>`;
    const fr = (opacity: number) => `<image x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${f(frameH)}" preserveAspectRatio="none" opacity="${opacity}" xlink:href="${frameUrl}"/>`;
    if (p.kind === 'screenshot') out.push(shot);
    else if (p.kind === 'frame') out.push(fr(1));
    else out.push(shot, fr((args.overlay ?? 50) / 100));
    out.push(`<rect x="${f(x - 0.5)}" y="${f(y - 0.5)}" width="${f(width + 1)}" height="${f(p.rect.height + 1)}" fill="none" stroke="${WF.frame}" stroke-width="1"/>`);
    if (args.grid) out.push(gridMarkup(p.rect, args.grid, L.scale));
    labels.push({ text: p.label, x, y: y - L.labelSize * 0.9, size: L.labelSize, weight: 500 });
  }
  out.push(await outlinedLabels(labels, L.width, L.height), '</svg>');
  return { png: await renderPng(out.join('\n'), L.width), layout: L };
}

/** The frame `wf compare --screen` means: one frame, or an error that says how to pick. */
export function compareFrame(doc: DesignDocument, args: Pick<CompareArgs, 'screen' | 'platform'>): ScreenNode {
  const found = framesFor(doc, args.screen, args.platform);
  if (found.length > 1) throw new Error(`“${args.screen}” has ${found.length} frames (${found.map((x) => x.screen.platform).join(', ')}); pick one with --platform`);
  return found[0];
}

// ---------- the commands ----------

export interface WfViewDeps {
  /** Reads a project file into a validated, materialized document. */
  loadDoc: (path: string) => Promise<DesignDocument>;
  readBytes: (path: string) => Promise<Uint8Array>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
  err: (s: string) => void;
}

export const WF_VIEW_COMMANDS = ['sheet', 'compare'] as const;

/** `designer wf sheet <project> …` / `designer wf compare <screenshot> <project> …`; returns the exit code. */
export async function wfViewCommand(sub: string, pos: string[], values: Values, output: string | undefined, deps: WfViewDeps): Promise<number> {
  if (sub === 'sheet') {
    if (!pos[0]) throw new WfUsageError('Missing project file');
    const args = parseSheetArgs(values);
    const doc = await deps.loadDoc(pos[0]);
    if (!doc.wireframe) throw new Error(`${pos[0]} is not a wireframe project (create one with \`designer new --preset wireframe\`)`);
    const { png, layout } = await renderSheet(doc, args);
    const target = output ?? pos[0].replace(/(\.designer)?\.json$/i, '') + '-sheet.png';
    await deps.write(target, png);
    deps.err(`Wrote sheet of ${layout.frames.length} frame${layout.frames.length === 1 ? '' : 's'}, ${layout.arrows.length} flow${layout.arrows.length === 1 ? '' : 's'}${layout.notes.length ? `, ${layout.notes.length} note${layout.notes.length === 1 ? '' : 's'}` : ''} (${layout.width}×${layout.height} px, ${Math.round(layout.scale * 100)}%) to ${target}`);
    return 0;
  }
  if (sub === 'compare') {
    if (!pos[0] || !pos[1]) throw new WfUsageError('wf compare needs <screenshot.png> <project>');
    const args = parseCompareArgs(values);
    const doc = await deps.loadDoc(pos[1]);
    if (!doc.wireframe) throw new Error(`${pos[1]} is not a wireframe project (create one with \`designer new --preset wireframe\`)`);
    const frame = compareFrame(doc, args);
    const shot = await deps.readBytes(pos[0]);
    const { png, layout } = await renderCompare(doc, frame, shot, args);
    const target = output ?? `${screenSlug(frame.name)}.${frame.screen.platform}.compare.png`;
    await deps.write(target, png);
    deps.err(`Wrote comparison of “${frame.name}” (${frame.screen.platform}, ${Math.round(frame.screen.width)} px wide) with ${pos[0]} (${layout.width}×${layout.height} px, ${Math.round(layout.scale * 100)}%) to ${target}`);
    return 0;
  }
  throw new WfUsageError(`Unknown wf command “${sub}” (${WF_VIEW_COMMANDS.join(', ')})`);
}
