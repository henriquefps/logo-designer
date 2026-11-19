// Export for AI (docs/wireframe-mode.md → Export package): a wireframe document as markdown an AI
// agent reads to build the app, plus the zip around it. Pure: no DOM, no store. Component lines come
// from each definition's `describe()`; this file knows no component kind.
//
// Package layout (inside a `<project-slug>/` folder in the zip):
//   README.md                      project, logical screens with platforms, notes not attached to a screen
//   screens/<slug>.md              one logical screen: every variant's component tree, notes next to elements
//   screens/<slug>.<platform>.png  one image per frame (notes excluded)
//   project.designer.json          the editable project
//
// Phase 2 extension points: `README_SECTIONS` (flow list + Mermaid diagram) and `SCREEN_SECTIONS`
// (screen status, incoming/outgoing flow). Add a function there; nothing else changes.
import JSZip from 'jszip';
import { isComponentNode, isScreenNode, type DesignDocument, type GroupNode, type Id, type LayoutInfo, type SceneNode, type ScreenNode, type ScreenPlatform } from '@/model';
import { serializeProject } from '@/io/projectFile';
import { getComponent } from './library/registry';
import { resolveProps } from './library/types';
import { notesFor, type NoteForExport } from './notes';
import { screenSlug } from './screens';

const PLATFORM_ORDER: ScreenPlatform[] = ['phone', 'tablet', 'desktop'];
const platformLabel = (p: ScreenPlatform) => p[0].toUpperCase() + p.slice(1);
const size = (w: number, h: number) => `${Math.round(w)}×${Math.round(h)}`;
const quote = (s: string) => JSON.stringify(s.replace(/\s*\n\s*/g, ' ').trim());

// ---------- model of the package ----------

export interface AiVariant {
  frame: ScreenNode;
  platform: ScreenPlatform;
  /** `<slug>.<platform>.png`, relative to `screens/`. */
  image: string;
}

export interface AiScreen {
  /** `wireframe.screens[].id` (for a frame whose logical screen is missing: its own `screenId`). */
  id: Id;
  name: string;
  /** Unique across the project and stable: the slugified name, `-2`, `-3`… on a clash. */
  slug: string;
  variants: AiVariant[];
}

/** Context handed to the phase 2 section hooks. */
export interface AiContext {
  doc: DesignDocument;
  screens: AiScreen[];
  notes: NoteForExport[];
}

/** Extra README sections (phase 2: flows). Each returns markdown lines, or nothing. */
export const README_SECTIONS: ((ctx: AiContext) => string[])[] = [];
/** Extra sections of one screen's file (phase 2: status, flows in and out). */
export const SCREEN_SECTIONS: ((ctx: AiContext, screen: AiScreen) => string[])[] = [];

/** Logical screens with their variants, in the order of `wireframe.screens`, with unique slugs. */
export function aiScreens(doc: DesignDocument): AiScreen[] {
  const frames = doc.children.filter(isScreenNode);
  const logical = [...(doc.wireframe?.screens ?? [])];
  // Frames that point at a logical screen that is missing still get exported.
  for (const f of frames) if (!logical.some((s) => s.id === f.screen.screenId)) logical.push({ id: f.screen.screenId, name: f.name });
  const taken = new Set<string>();
  return logical.map((s) => {
    const base = screenSlug(s.name);
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    taken.add(slug);
    const variants = frames
      .filter((f) => f.screen.screenId === s.id)
      .sort((a, b) => PLATFORM_ORDER.indexOf(a.screen.platform) - PLATFORM_ORDER.indexOf(b.screen.platform))
      .map((frame) => ({ frame, platform: frame.screen.platform, image: `${slug}.${frame.screen.platform}.png` }));
    return { id: s.id, name: s.name, slug, variants };
  });
}

// ---------- the component tree ----------

const stackName = (l: LayoutInfo) => (l.kind === 'vstack' ? 'Vertical stack' : l.kind === 'hstack' ? 'Horizontal stack' : `Grid (${l.columns ?? 2} columns)`);

function shapeLine(n: SceneNode): string {
  switch (n.type) {
    case 'text':
      return `Text ${quote(n.text)}`;
    case 'rect':
      return 'Shape (rectangle)';
    case 'ellipse':
      return 'Shape (ellipse)';
    case 'polygon':
      return n.innerRadius !== undefined ? 'Shape (star)' : `Shape (polygon, ${n.sides} sides)`;
    case 'path':
      return 'Shape (path)';
    case 'image':
      return 'Image';
    default:
      return 'Group';
  }
}

/** Where a node outside the flow sits in its frame: `bottom right`, `top`, … (empty when unknown). */
function cornerOf(n: SceneNode, frame: ScreenNode): string {
  const w = (n.type === 'group' && (n.component?.size?.width ?? n.layout?.size?.width)) || 0;
  const h = (n.type === 'group' && (n.component?.size?.height ?? n.layout?.size?.height)) || 0;
  if (!w || !h) return '';
  const cx = n.transform.x + w / 2;
  const cy = n.transform.y + h / 2;
  const v = cy < frame.screen.height / 3 ? 'top' : cy > (frame.screen.height * 2) / 3 ? 'bottom' : 'middle';
  const hz = cx < frame.screen.width / 3 ? 'left' : cx > (frame.screen.width * 2) / 3 ? 'right' : 'center';
  return v === 'middle' && hz === 'center' ? 'center' : [v === 'middle' ? '' : v, hz === 'center' ? '' : hz].filter(Boolean).join(' ');
}

class TreeWriter {
  private readonly lines: string[] = [];
  /** Notes by the node they are attached to. */
  private readonly byTarget = new Map<Id, NoteForExport[]>();
  /** Notes that were written (the rest go to a trailing list). */
  private readonly used = new Set<Id>();
  /** A node inside a component (or inside a collapsed container) → the node that was written for it. */
  private readonly alias = new Map<Id, Id>();

  private readonly frame: ScreenNode;

  constructor(frame: ScreenNode, notes: NoteForExport[]) {
    this.frame = frame;
    for (const n of notes) {
      if (n.targetId === undefined) continue;
      this.byTarget.set(n.targetId, [...(this.byTarget.get(n.targetId) ?? []), n]);
    }
    const aliasDescendants = (n: GroupNode, root: Id) => {
      for (const c of n.children) {
        this.alias.set(c.id, root);
        if (c.type === 'group') aliasDescendants(c, root);
      }
    };
    const scan = (n: GroupNode) => {
      for (const c of n.children) {
        if (c.type !== 'group') continue;
        if (isComponentNode(c)) aliasDescendants(c, c.id);
        else scan(c);
      }
    };
    scan(frame);
  }

  private notesOf(ids: readonly Id[]): NoteForExport[] {
    const out: NoteForExport[] = [];
    for (const [target, list] of this.byTarget) {
      const owner = this.alias.get(target) ?? target;
      if (ids.includes(owner)) out.push(...list.filter((n) => !this.used.has(n.noteId)));
    }
    return out;
  }

  private line(depth: number, text: string, ids: readonly Id[]) {
    this.lines.push(`${'  '.repeat(depth)}- ${text}`);
    for (const n of this.notesOf(ids)) {
      this.used.add(n.noteId);
      this.lines.push(`${'  '.repeat(depth + 1)}- Note: ${n.text.replace(/\s*\n\s*/g, ' ').trim()}`);
    }
  }

  private position(n: SceneNode, parentIsFrame: boolean): string {
    const p = n.layoutItem?.position;
    if (p === 'pinned-bottom') return 'pinned to bottom';
    if (p === 'free') {
      const where = parentIsFrame ? cornerOf(n, this.frame) : '';
      return where ? `floating, ${where}` : 'floating';
    }
    return '';
  }

  /** Children in reading order: stack order for a laid-out parent, top-to-bottom for free placement. */
  private ordered(parent: GroupNode): SceneNode[] {
    const kids = parent.children.filter((c) => c.visible && !c.reference);
    if (parent.layout) return kids;
    return [...kids].sort((a, b) => a.transform.y - b.transform.y || a.transform.x - b.transform.x);
  }

  write(parent: GroupNode, depth: number, parentIsFrame: boolean, carried: Id[] = []): void {
    for (const n of this.ordered(parent)) this.node(n, depth, parentIsFrame, carried);
  }

  private node(n: SceneNode, depth: number, parentIsFrame: boolean, carried: Id[]): void {
    const pos = this.position(n, parentIsFrame);
    const withPos = (t: string) => (pos ? `${t} — ${pos}` : t);
    if (n.type !== 'group') return this.line(depth, withPos(shapeLine(n)), [n.id, ...carried]);
    if (isComponentNode(n)) {
      const def = getComponent(n.component.kind);
      let text: string;
      if (def) {
        try {
          text = def.describe(resolveProps(def, n.component.props));
        } catch {
          text = `${def.label} component`;
        }
      } else text = `Component "${n.component.kind}" (unknown kind)`;
      return this.line(depth, withPos(text), [n.id, ...carried]);
    }
    const kids = n.children.filter((c) => c.visible && !c.reference);
    if (!kids.length) return;
    if (n.layout) {
      // A single child in a plain stack adds nothing: list the child directly.
      if (kids.length === 1 && n.layout.kind !== 'grid' && !pos) return this.node(kids[0], depth, parentIsFrame, [n.id, ...carried]);
      this.line(depth, withPos(stackName(n.layout)), [n.id, ...carried]);
    } else this.line(depth, withPos('Group'), [n.id, ...carried]);
    this.write(n, depth + 1, false);
  }

  /** Notes attached to something in this frame that no line could carry (e.g. a hidden node). */
  leftover(allIds: readonly Id[]): NoteForExport[] {
    return [...this.byTarget.values()].flat().filter((n) => !this.used.has(n.noteId) && (allIds.includes(n.targetId!) || this.alias.has(n.targetId!)));
  }

  text(): string[] {
    return this.lines;
  }

  noteIdsUsed(): ReadonlySet<Id> {
    return this.used;
  }

  markUsed(n: NoteForExport) {
    this.used.add(n.noteId);
  }
}

function collectIds(n: GroupNode, out: Id[] = []): Id[] {
  for (const c of n.children) {
    out.push(c.id);
    if (c.type === 'group') collectIds(c, out);
  }
  return out;
}

/** A variant: heading, frame notes, layout note and the tree. */
function variantMarkdown(v: AiVariant, notes: NoteForExport[]): string[] {
  const f = v.frame;
  const out = [`## ${platformLabel(v.platform)} (${size(f.screen.width, f.screen.height)})`, '', `Image: \`${v.image}\``, ''];
  const w = new TreeWriter(f, notes);
  const l = f.layout;
  if (!l) out.push('Elements are placed freely (no stack); listed top to bottom.', '');
  else if (l.kind !== 'vstack') out.push(`Layout: ${stackName(l)}.`, '');
  for (const n of notes.filter((x) => x.targetId === f.id)) {
    out.push(`Note on the whole screen: ${n.text.replace(/\s*\n\s*/g, ' ').trim()}`, '');
    w.markUsed(n);
  }
  w.write(f, 0, true);
  const tree = w.text();
  out.push(...(tree.length ? tree : ['(empty)']));
  const rest = w.leftover(collectIds(f));
  if (rest.length) out.push('', 'Other notes on this variant:', ...rest.map((n) => `- ${n.text.replace(/\s*\n\s*/g, ' ').trim()}`));
  out.push('');
  return out;
}

// ---------- markdown ----------

export interface AiMarkdown {
  readme: string;
  /** One per logical screen, same order as `aiScreens`. */
  screens: { slug: string; name: string; markdown: string }[];
}

const variantSummary = (s: AiScreen) => (s.variants.length ? s.variants.map((v) => `${v.platform} ${size(v.frame.screen.width, v.frame.screen.height)}`).join(', ') : 'no variants yet');

export function aiMarkdown(doc: DesignDocument): AiMarkdown {
  if (!doc.wireframe) throw new Error('Not a wireframe document.');
  const screens = aiScreens(doc);
  const notes = notesFor(doc);
  const ctx: AiContext = { doc, screens, notes };

  const free = notes.filter((n) => n.screenId === undefined);
  const readme = [
    `# ${doc.name}`,
    '',
    'Wireframe of an app, exported for an AI agent. It describes structure and content, not visual design: the wireframes are low fidelity (black, white and greys); build the real UI with the target stack and its own design system.',
    '',
    '## Screens',
    '',
    ...(screens.length
      ? screens.map((s) => `- ${s.name} — ${variantSummary(s)} — \`screens/${s.slug}.md\``)
      : ['No screens yet.']),
    '',
    '## How to read the screen files',
    '',
    '- Each screen file has one section per variant (platform and width). A variant is a full layout for that device class, not a responsive rule.',
    '- Components are indented lists, top to bottom, as laid out. Children are indented under their container.',
    '- "Vertical stack", "Horizontal stack" and "Grid" mark groups that belong together. "pinned to bottom" stays at the bottom edge of the screen; "floating" sits on top of the content.',
    '- "Note:" lines are the designer\'s remarks about the element above them.',
    '- `screens/<name>.<platform>.png` is an image of each variant; `project.designer.json` is the editable project.',
    '',
    ...(free.length ? ['## Notes', '', ...free.map((n) => `- ${n.text.replace(/\s*\n\s*/g, ' ').trim()}`), ''] : []),
    ...README_SECTIONS.flatMap((s) => s(ctx)),
  ];

  const files = screens.map((s) => {
    const md: string[] = [`# ${s.name}`, ''];
    if (!s.variants.length) md.push('No variants yet.', '');
    for (const v of s.variants) md.push(...variantMarkdown(v, notes));
    md.push(...SCREEN_SECTIONS.flatMap((x) => x(ctx, s)));
    return { slug: s.slug, name: s.name, markdown: tidy(md) };
  });
  return { readme: tidy(readme), screens: files };
}

const tidy = (lines: string[]) => lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

/** Everything as one text, for the clipboard: README, then each screen under its own heading. No images. */
export function aiMarkdownCombined(doc: DesignDocument): string {
  const m = aiMarkdown(doc);
  return [m.readme.trimEnd(), ...m.screens.map((s) => `---\n\n<!-- screens/${s.slug}.md -->\n${s.markdown.trimEnd()}`)].join('\n\n') + '\n';
}

// ---------- the zip ----------

/** Renders one frame to PNG bytes (the app uses the canvas export, the CLI resvg). */
export type RenderFramePng = (frame: ScreenNode) => Promise<Uint8Array>;

export const aiProjectSlug = (doc: DesignDocument) => screenSlug(doc.name || 'wireframe');

/** The package as `path → bytes/text`, paths relative to the package root. */
export async function aiPackageFiles(doc: DesignDocument, renderPng: RenderFramePng): Promise<Record<string, string | Uint8Array>> {
  const md = aiMarkdown(doc);
  const files: Record<string, string | Uint8Array> = { 'README.md': md.readme };
  for (const s of md.screens) files[`screens/${s.slug}.md`] = s.markdown;
  for (const s of aiScreens(doc)) for (const v of s.variants) files[`screens/${v.image}`] = await renderPng(v.frame);
  files['project.designer.json'] = serializeProject(doc);
  return files;
}

/** `<project-slug>-for-ai.zip` contents: every file under a `<project-slug>/` folder. */
export async function aiZip(doc: DesignDocument, renderPng: RenderFramePng): Promise<Uint8Array> {
  const root = aiProjectSlug(doc);
  const zip = new JSZip();
  for (const [path, data] of Object.entries(await aiPackageFiles(doc, renderPng))) zip.file(`${root}/${path}`, data);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
