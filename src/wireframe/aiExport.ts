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
// Phase 2: screen status (README list, top of each screen file), flows (README "Flow" section with a
// Mermaid diagram, "→ opens X" under each source element, "Opened from" per screen: ./flowExport.ts).
// More sections: add a function to `README_SECTIONS` / `SCREEN_SECTIONS`.
import JSZip from 'jszip';
import {
  isComponentNode,
  isScreenNode,
  type DesignDocument,
  type GroupNode,
  type Id,
  type LayoutInfo,
  type SceneNode,
  type ScreenNode,
  type ScreenPlatform,
  type ScreenStatus,
  type WireframeFlow,
} from '@/model';
import { serializeProject } from '@/io/projectFile';
import { getComponent } from './library/registry';
import { autoProps, isAutoProp, resolveProps, type PartOpens } from './library/types';
import { notesFor, type NoteForExport } from './notes';
import { logicalScreen, screenSlug } from './screens';
import { flowOpensLine, flowReadmeSection, flowScreenSection, flowSourceText, STATUS_TEXT } from './flowExport';
import { flowSources, flowsOf, partLabel } from './flows';
import { styleWords } from './containers';
import { repeatCount, repeatTemplate } from './repeat';
import { instancePrefix, instancesOf, isSlot, newSymbolInstance, slotsOf, symbolsOf } from './symbols';

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
  status?: ScreenStatus;
  variants: AiVariant[];
}

/** Context handed to the phase 2 section hooks. */
export interface AiContext {
  doc: DesignDocument;
  screens: AiScreen[];
  notes: NoteForExport[];
}

/** Extra README sections (flows). Each returns markdown lines, or nothing. */
export const README_SECTIONS: ((ctx: AiContext) => string[])[] = [flowReadmeSection];
/** Extra sections at the end of one screen's file (where it is opened from). */
export const SCREEN_SECTIONS: ((ctx: AiContext, screen: AiScreen) => string[])[] = [flowScreenSection];

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
    return { id: s.id, name: s.name, slug, ...(s.status ? { status: s.status } : {}), variants };
  });
}

// ---------- the component tree ----------

const stackName = (l: LayoutInfo) => (l.kind === 'vstack' ? 'Vertical stack' : l.kind === 'hstack' ? 'Horizontal stack' : `Grid (${l.columns ?? 2} columns)`);

/** A container's line: its kind, and its look when styled ("Card container (outlined)", "Grid (2 columns, filled)"). */
function containerName(l: LayoutInfo): string {
  const look = styleWords(l);
  if (!look) return stackName(l);
  if (l.kind === 'vstack') return `Card container (${look})`;
  if (l.kind === 'hstack') return `Horizontal stack (${look})`;
  return `Grid (${l.columns ?? 2} columns, ${look})`;
}

/** "List of 6 × (…)", by the container's kind: vertical = list, horizontal = carousel, grid = gallery. */
function listName(l: LayoutInfo, count: number, item: string): string {
  if (l.kind === 'hstack') return `Horizontal list of ${count} × (${item})`;
  if (l.kind === 'grid') return `Grid of ${count} × (${item}), ${l.columns ?? 2} columns`;
  return `List of ${count} × (${item})`;
}

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
  /** Outgoing flows by source node, written under it ("→ opens Language"). */
  private readonly flows = new Map<Id, string[]>();
  /** Flows from parts of a component, by node and part key: written in its line ("Arquivos → opens Arquivos"). */
  private readonly partFlows = new Map<Id, Map<string, { text: string; label: string }[]>>();
  /** Describing a shared component's master (README): a selected item that follows the screen is said so. */
  private readonly master: boolean;

  /** Shared component names by master id ("Shared: Trip card"). */
  private readonly shared: ReadonlyMap<Id, string>;

  constructor(
    frame: ScreenNode,
    notes: NoteForExport[],
    flows: FlowEntry[] = [],
    opts: { shared?: ReadonlyMap<Id, string>; sourceText?: (id: Id, part?: string) => string; master?: boolean } = {},
  ) {
    this.frame = frame;
    this.shared = opts.shared ?? new Map();
    this.master = !!opts.master;
    // Shared instances are one line ("Shared: Trip card"): flows from inside one are written under it, with their source.
    const insideShared = new Map<Id, Id>();
    const scanShared = (n: GroupNode) => {
      for (const c of n.children) {
        if (c.type !== 'group' || c.component || c.repeatCopy) continue;
        if (c.symbol && this.shared.has(c.symbol.id)) {
          // A slot's content is the instance's own: written like any content, not as part of the shared piece.
          const mark = (g: GroupNode) => {
            for (const x of g.children) {
              insideShared.set(x.id, c.id);
              if (x.type === 'group' && !isSlot(x)) mark(x);
            }
          };
          mark(c);
          for (const slot of slotsOf(c)) scanShared(slot);
        } else scanShared(c);
      }
    };
    scanShared(frame);
    for (const { flow, target, source, partLabel: label } of flows) {
      const owner = insideShared.get(source);
      // A shared flow inside a shared instance is part of the master, described once in the README.
      if (owner && flow.symbol) continue;
      if (flow.part !== undefined && !owner) {
        const byKey = this.partFlows.get(source) ?? new Map<string, { text: string; label: string }[]>();
        byKey.set(flow.part, [...(byKey.get(flow.part) ?? []), { text: flowOpensLine(flow, target), label: label ?? flow.part }]);
        this.partFlows.set(source, byKey);
        continue;
      }
      const line = flowOpensLine(flow, target) + (owner && opts.sourceText ? ` (from ${opts.sourceText(source, flow.part)})` : '');
      const key = owner ?? source;
      this.flows.set(key, [...(this.flows.get(key) ?? []), line]);
    }
    for (const n of notes) {
      if (n.targetId === undefined) continue;
      this.byTarget.set(n.targetId, [...(this.byTarget.get(n.targetId) ?? []), n]);
    }
    const aliasDescendants = (n: GroupNode, root: Id) => {
      for (const c of n.children) {
        this.alias.set(c.id, root);
        if (c.type === 'group' && !isSlot(c)) aliasDescendants(c, root);
      }
    };
    const scan = (n: GroupNode) => {
      for (const c of n.children) {
        if (c.type !== 'group') continue;
        if (isComponentNode(c)) aliasDescendants(c, c.id);
        else if (c.symbol && this.shared.has(c.symbol.id)) {
          aliasDescendants(c, c.id);
          for (const slot of slotsOf(c)) scan(slot);
        } else scan(c);
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

  private line(depth: number, text: string, ids: readonly Id[], extra: readonly string[] = []) {
    this.lines.push(`${'  '.repeat(depth)}- ${text}`);
    for (const l of extra) this.lines.push(`${'  '.repeat(depth + 1)}- ${l}`);
    for (const id of ids) {
      for (const l of this.flows.get(id) ?? []) this.lines.push(`${'  '.repeat(depth + 1)}- ${l}`);
      this.flows.delete(id);
    }
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
    // Repeat copies are described once, by their template ("List of N × (…)").
    const kids = parent.children.filter((c) => c.visible && !c.reference && !c.repeatCopy);
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
      const parts = this.partFlows.get(n.id);
      const used = new Set<string>();
      const opens: PartOpens | undefined = parts && {
        has: (key) => parts.has(key),
        take: (key) => {
          const list = parts.get(key);
          if (!list) return undefined;
          used.add(key);
          return list.map((x) => x.text).join(', ');
        },
      };
      let text: string;
      if (def) {
        try {
          text = def.describe(resolveProps(def, n.component.props, n.component.resolved), opens);
          if (this.master && autoProps(def).some((k) => isAutoProp(def, n.component.props, k))) text += ' — the selected item follows the screen (the one that opens the screen on show)';
        } catch {
          text = `${def.label} component`;
        }
      } else text = `Component "${n.component.kind}" (unknown kind)`;
      // Parts the line did not mention: one line each under it.
      const extra = parts ? [...parts].filter(([k]) => !used.has(k)).flatMap(([, list]) => list.map((x) => `${x.text} (from ${JSON.stringify(x.label)})`)) : [];
      this.partFlows.delete(n.id);
      return this.line(depth, withPos(text), [n.id, ...carried], extra);
    }
    const shared = n.symbol && this.shared.get(n.symbol.id);
    if (shared) return this.instance(n, shared, depth, withPos, carried);
    const kids = n.children.filter((c) => c.visible && !c.reference && !c.repeatCopy);
    // A master's slot: said so (what an instance puts there is described on its screen).
    const slot = this.master && n.layout?.slot ? ' — content per instance' : '';
    if (!kids.length) {
      if (slot && n.layout) this.line(depth, withPos(`${containerName(n.layout)}${slot} (empty by default)`), [n.id, ...carried]);
      return;
    }
    if (n.layout) {
      const template = repeatTemplate(n);
      if (template && kids.includes(template)) return this.repeat(n as GroupNode & { layout: LayoutInfo }, template, kids, depth, withPos, carried);
      // A single child in a plain stack adds nothing: list the child directly.
      if (kids.length === 1 && n.layout.kind !== 'grid' && !pos && !styleWords(n.layout) && !slot) return this.node(kids[0], depth, parentIsFrame, [n.id, ...carried]);
      this.line(depth, withPos(`${containerName(n.layout)}${slot}${slot ? ', by default:' : ''}`), [n.id, ...carried]);
    } else this.line(depth, withPos('Group'), [n.id, ...carried]);
    this.write(n, depth + 1, false);
  }

  /**
   * A shared instance: "Shared: App shell", with the text it overrides ("— text: Title "Inbox"") and what its
   * slots hold, under it ("Shared: App shell, content:"; several slots: one "In <slot>:" line each).
   */
  private instance(n: GroupNode, name: string, depth: number, withPos: (t: string) => string, carried: Id[]): void {
    const text = overrideWords(n);
    const filled = slotsOf(n).filter((sl) => sl.children.some((c) => c.visible && !c.reference));
    const head = `Shared: ${name}${text ? ` — text: ${text}` : ''}`;
    this.line(depth, withPos(filled.length ? `${head}, content:` : head), [n.id, ...carried]);
    if (filled.length === 1) this.write(filled[0], depth + 1, false);
    else
      for (const sl of filled) {
        this.lines.push(`${'  '.repeat(depth + 1)}- In ${JSON.stringify(sl.name)}:`);
        this.write(sl, depth + 2, false);
      }
  }

  /** A repeating container: "List of N × (template)", the template's content under it, then any other children. */
  private repeat(n: GroupNode & { layout: LayoutInfo }, template: SceneNode, kids: SceneNode[], depth: number, withPos: (t: string) => string, carried: Id[]): void {
    const count = repeatCount(n.layout);
    const rest = kids.filter((c) => c !== template);
    const own = !rest.length && !styleWords(n.layout);
    const at = own ? depth : depth + 1;
    if (!own) this.line(depth, withPos(containerName(n.layout)), [n.id, ...carried]);
    let item: string;
    let inner: GroupNode | null = null;
    const shared = template.type === 'group' && template.symbol ? this.shared.get(template.symbol.id) : undefined;
    if (shared) item = `Shared: ${shared}`;
    else if (template.type !== 'group') item = shapeLine(template);
    else if (isComponentNode(template)) {
      const def = getComponent(template.component.kind);
      try {
        item = def ? def.describe(resolveProps(def, template.component.props)) : `Component "${template.component.kind}" (unknown kind)`;
      } catch {
        item = `${def?.label ?? 'Unknown'} component`;
      }
    } else {
      item = template.layout ? containerName(template.layout) : 'Group';
      inner = template;
    }
    const text = listName(n.layout, count, item) + (inner && inner.children.some((c) => c.visible && !c.reference) ? ', each:' : '');
    this.line(at, own ? withPos(text) : text, own ? [n.id, template.id, ...carried] : [template.id]);
    if (inner) this.write(inner, at + 1, false);
    for (const c of rest) this.node(c, depth + 1, false, []);
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
function variantMarkdown(doc: DesignDocument, v: AiVariant, notes: NoteForExport[]): string[] {
  const f = v.frame;
  const out = [`## ${platformLabel(v.platform)} (${size(f.screen.width, f.screen.height)})`, '', `Image: \`${v.image}\``, ''];
  const flows = flowEntries(doc);
  const w = new TreeWriter(f, notes, flows, { shared: sharedNames(doc), sourceText: (id, part) => flowSourceText(doc, id, part) });
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

// ---------- flows ----------

/** A flow at one of the canvas nodes it starts at (a shared flow: one entry per instance). */
interface FlowEntry {
  flow: WireframeFlow;
  /** The target screen's name. */
  target: string;
  /** The canvas node. */
  source: Id;
  /** The part's label, for flows from a part. */
  partLabel?: string;
}

function flowEntries(doc: DesignDocument): FlowEntry[] {
  return flowsOf(doc).flatMap((flow) => {
    const target = logicalScreen(doc, flow.to)?.name ?? 'a missing screen';
    return flowSources(doc, flow).map((source) => ({ flow, target, source, ...(flow.part !== undefined ? { partLabel: partLabel(doc, source, flow.part) } : {}) }));
  });
}

// ---------- shared components ----------

/** The text an instance overrides, for its line: `Row "Inbox"`, `Row: title "Inbox", subtitle "2 new"`. */
function overrideWords(n: GroupNode): string {
  const text = n.symbol?.text;
  if (!text) return '';
  const prefix = instancePrefix(n.id);
  const byId = new Map<Id, SceneNode>();
  const visit = (nodes: readonly SceneNode[]) => {
    for (const c of nodes) {
      byId.set(c.id, c);
      if (c.type === 'group' && !c.component && !c.symbol) visit(c.children);
    }
  };
  visit(n.children);
  const parts: string[] = [];
  for (const [key, props] of Object.entries(text)) {
    const target = byId.get(prefix + key);
    const label = target?.name || key;
    const entries = Object.entries(props);
    if (entries.length === 1) parts.push(`${label} ${JSON.stringify(entries[0][1])}`);
    else parts.push(`${label}: ${entries.map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')}`);
  }
  return parts.join('; ');
}

const sharedNames = (doc: DesignDocument): ReadonlyMap<Id, string> => new Map(symbolsOf(doc).map((s) => [s.id, s.name]));

/**
 * README "Shared components": each master described once (its content tree, nested shared components by
 * name) and where it is used. Screens refer to them as "Shared: <name>".
 */
function sharedReadmeSection(ctx: AiContext): string[] {
  const symbols = symbolsOf(ctx.doc);
  if (!symbols.length) return [];
  const names = sharedNames(ctx.doc);
  const byFrame = new Map(ctx.screens.flatMap((s) => s.variants.map((v) => [v.frame.id, s.name] as const)));
  const out = ['## Shared components', '', 'Pieces used on several screens. Build each once as a reusable component; screen files refer to them as "Shared: <name>".', ''];
  for (const s of symbols) {
    out.push(`### ${s.name}`, '');
    const used = new Set<string>();
    for (const inst of instancesOf(ctx.doc, s.id)) {
      const top = ctx.doc.children.find((f) => f.type === 'group' && (f === inst || containsNode(f, inst.id)));
      const name = top && byFrame.get(top.id);
      if (name) used.add(name);
    }
    out.push(used.size ? `Used on: ${[...used].join(', ')}.` : 'Not used on a screen yet.', '');
    // The master as an instance shows it (nested instances expanded), written like a screen's tree.
    const root: GroupNode = { ...newSymbolInstance(s, symbols, { x: 0, y: 0 }), symbol: undefined };
    const size = root.layout?.size ?? { width: 0, height: 0 };
    const holder = { ...root, id: `${s.id}~holder`, children: [root], screen: { screenId: '', platform: 'phone', ...size } } as ScreenNode;
    // Links defined in the master ("one link, all screens") are written in its tree.
    const masterDoc = { ...ctx.doc, children: [holder] } as DesignDocument;
    const flows = flowsOf(ctx.doc)
      .filter((f) => f.symbol === s.id)
      .map((flow): FlowEntry => {
        const source = instancePrefix(root.id) + flow.from;
        return { flow, target: logicalScreen(ctx.doc, flow.to)?.name ?? 'a missing screen', source, ...(flow.part !== undefined ? { partLabel: partLabel(masterDoc, source, flow.part) } : {}) };
      });
    const w = new TreeWriter(holder, [], flows, { shared: names, master: true });
    w.write(holder, 0, false);
    const tree = w.text();
    out.push(...(tree.length ? tree : ['(empty)']), '');
  }
  return out;
}

function containsNode(n: GroupNode, id: Id): boolean {
  return n.children.some((c) => c.id === id || (c.type === 'group' && containsNode(c, id)));
}

// ---------- markdown ----------

export interface AiMarkdown {
  readme: string;
  /** One per logical screen, same order as `aiScreens`. */
  screens: { slug: string; name: string; markdown: string }[];
}

const variantSummary = (s: AiScreen) =>
  (s.variants.length ? s.variants.map((v) => `${v.platform} ${size(v.frame.screen.width, v.frame.screen.height)}`).join(', ') : 'no variants yet') +
  (s.status ? ` — status: ${s.status}` : '');

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
    '- "Card container (outlined)" (or filled) is a group drawn as a card around its children.',
    '- "List of 6 × (…)" is a repeated item: build it once and repeat it (a list, a horizontal list or a grid); the content under it is one item.',
    ...(symbolsOf(doc).length ? ['- "Shared: Trip card" is a shared component: the same piece on several screens, described once in the Shared components section below. Build it once and reuse it.'] : []),
    '- "Note:" lines are the designer\'s remarks about the element above them.',
    '- `screens/<name>.<platform>.png` is an image of each variant; `project.designer.json` is the editable project.',
    ...(screens.some((s) => s.status) ? ['- Status: "current" = the screen as the app has it today; "changed" = a proposed change to a screen the app already has; "new" = a screen to add. A screen without a status does not say.'] : []),
    ...(flowsOf(doc).length ? ['- "→ opens X" under an element, or after an item in its line ("Bottom navigation: Gallery (selected) → opens Gallery; Files → opens Files"): tapping (or clicking) it opens the screen X. The Flow section below has the whole map.'] : []),
    '',
    ...(free.length ? ['## Notes', '', ...free.map((n) => `- ${n.text.replace(/\s*\n\s*/g, ' ').trim()}`), ''] : []),
    ...sharedReadmeSection(ctx),
    ...README_SECTIONS.flatMap((s) => s(ctx)),
  ];

  const files = screens.map((s) => {
    const md: string[] = [`# ${s.name}`, ''];
    if (s.status) md.push(`Status: ${STATUS_TEXT[s.status]}.`, '');
    if (!s.variants.length) md.push('No variants yet.', '');
    for (const v of s.variants) md.push(...variantMarkdown(doc, v, notes));
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
