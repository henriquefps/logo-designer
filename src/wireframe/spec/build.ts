// Spec → project (docs/wireframe-spec.md). Pure: builds the nodes the app would make (library
// instances, stacks, shared component instances, frames, notes, flows) and runs the same pipeline the
// app runs on open (`materializeDocument`: components, symbols, repeat, layout, screens, flows), so
// the result is what Designer itself would show.
//
// `existing` (`designer wf build --into`): the spec updates that project by id. Matched objects keep
// what the spec does not express: the geometry (x / y / width / height / size of nodes, frame
// positions and widths, note positions) when the spec leaves it out, and things the spec has no word
// for (opacity of frames, reference / blend mode). Everything the spec states wins, and a node is
// removed only when the spec no longer lists it. Top-level `components`, `canvas`, `notes` and
// `flows` that the spec leaves out entirely are kept as they are.
import {
  createDocument,
  createGroup,
  findNode,
  newId,
  platformDef,
  walk,
  type ComponentInfo,
  type DesignDocument,
  type GroupNode,
  type Id,
  type LayoutInfo,
  type LayoutItemInfo,
  type SceneNode,
  type ScreenNode,
  type Transform,
  type WireframeFlow,
  type WireframeScreen,
  type WireframeSymbol,
} from '@/model';
import { getComponent } from '../library/registry';
import { storedProps } from '../library/types';
import { defaultLayout, defaultScreenLayout } from '../layout';
import { buildComponentInto } from '../steps/components';
import { materializeChildren, reaches } from '../symbols';
import { createScreenFrame, frames, newScreenPosition, screenSlug, variantPosition } from '../screens';
import { defaultPlacement } from '../instances';
import { buildNoteChildren, isNoteNode, notePositionFor, noteRect, notesOf, type NoteNode } from '../notes';
import { flowSource, flowSourceLabel, partsOfNode } from '../flows';
import { materializeDocument } from '../pipeline';
import { defaultName, layoutShape, sourceIds } from './common';
import { parseSpec } from './parse';
import { SpecError, type NormComponent, type NormNode, type NormSpec, type NormVariant, type SpecIssue } from './types';

export interface BuildSummary {
  screens: number;
  frames: number;
  /** Nodes the spec states (not generated ones). */
  nodes: number;
  /** With `existing`: stated nodes added / removed / kept. */
  added: number;
  removed: number;
  kept: number;
}

export interface SpecBuildResult {
  doc: DesignDocument;
  warnings: string[];
  summary: BuildSummary;
}

const IDENTITY: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const lc = (s: string) => s.trim().toLowerCase();

interface Ctx {
  /** Existing nodes by id (`--into`). */
  prev: Map<Id, SceneNode>;
  /** Ids the spec states anywhere: never taken by a positional match. */
  claimed: Set<Id>;
  symbols: WireframeSymbol[];
  issues: SpecIssue[];
  warnings: string[];
  /** Node-level sugar collected while building: `opens` (with `symbol`: inside that master) and `note`. */
  opens: { from: Id; to: string; part?: string; symbol?: Id; path: string }[];
  notes: { on: Id; text: string; path: string }[];
}

/** Where a node is built: whether its parent lays it out, whether it is a frame's direct child. */
interface Place {
  parentLays: boolean;
  frame?: { width: number; height: number; layout: boolean };
  /** The existing parent (for id-less positional matches). */
  prevParent?: GroupNode;
  index: number;
  /** Inside a master's content: ids are the master's own. */
  master?: Map<Id, SceneNode>;
  /** The master being built (with `master`). */
  symbol?: Id;
}

function signature(n: SceneNode): string {
  if (n.type !== 'group') return `raw:${n.type}`;
  if (n.symbol) return `use:${n.symbol.id}`;
  if (n.component) return `component:${n.component.kind}`;
  if (n.layout) return `container:${n.layout.kind}`;
  return 'group';
}

function normSignature(n: NormNode, ctx: Ctx): string {
  switch (n.form) {
    case 'component':
      return `component:${n.kind}`;
    case 'container':
      return `container:${n.kind}`;
    case 'use':
      return `use:${findSymbol(ctx.symbols, n.ref)?.id ?? n.ref}`;
    case 'group':
      return 'group';
    default:
      return `raw:${n.node.type}`;
  }
}

function findSymbol(symbols: readonly WireframeSymbol[], ref: string): WireframeSymbol | undefined {
  return symbols.find((s) => s.id === ref) ?? symbols.find((s) => lc(s.name) === lc(ref));
}

/** The existing node a spec node updates: by id, else the unclaimed child at the same index with the same kind. */
function matchPrev(n: NormNode, place: Place, ctx: Ctx): SceneNode | undefined {
  const index = place.master ?? ctx.prev;
  if (n.id !== undefined) return index.get(n.id);
  const cand = place.prevParent?.children.filter((c) => !c.repeatCopy)[place.index];
  if (cand && !ctx.claimed.has(cand.id) && signature(cand) === normSignature(n, ctx)) {
    ctx.claimed.add(cand.id);
    return cand;
  }
  return undefined;
}

function layoutItemOf(n: NormNode, prev: SceneNode | undefined, base?: LayoutItemInfo): LayoutItemInfo | undefined {
  const item: LayoutItemInfo = { ...(base ?? {}) };
  const width = n.width ?? prev?.layoutItem?.width;
  const height = n.height ?? prev?.layoutItem?.height;
  if (width !== undefined) item.width = width;
  if (height !== undefined) item.height = height;
  // Placement left out of the spec is kept like geometry (`build --into`): a pinned nav, a FAB placed by default
  // or a node Henrique unpinned stays as it is. New nodes get theirs from `base` (the default placement).
  const position = n.position ?? prev?.layoutItem?.position;
  const bleed = n.bleed ?? prev?.layoutItem?.bleed;
  if (position !== undefined) item.position = position;
  if (bleed !== undefined) item.bleed = bleed;
  return Object.keys(item).length ? item : undefined;
}

function transformOf(n: NormNode, prev: SceneNode | undefined, at?: { x: number; y: number }): Transform {
  const t = prev?.transform ?? IDENTITY;
  return {
    x: n.x ?? at?.x ?? t.x,
    y: n.y ?? at?.y ?? t.y,
    rotation: n.rotation ?? t.rotation,
    scaleX: n.scale?.[0] ?? t.scaleX,
    scaleY: n.scale?.[1] ?? t.scaleY,
  };
}

/** Builds one node (and its subtree). Null when it cannot be built (the issue is recorded). */
function buildNode(n: NormNode, place: Place, ctx: Ctx): SceneNode | null {
  if (n.form === 'node') {
    const node = structuredClone(n.node);
    if (n.id !== undefined) node.id = n.id;
    collectSugar(n, node.id, place, ctx);
    return node;
  }
  const prev = matchPrev(n, place, ctx);
  const id = n.id ?? prev?.id ?? newId();
  const free = n.position === 'free';
  const laid = place.parentLays && !free && !n.hidden;
  let node: GroupNode;
  let at: { x: number; y: number } | undefined;
  let itemBase: LayoutItemInfo | undefined;
  if (n.form === 'component') {
    const def = getComponent(n.kind)!;
    const props = storedProps(def, n.props);
    const prevComp = prev?.type === 'group' && prev.component?.kind === n.kind ? prev.component : undefined;
    let width = typeof n.width === 'number' ? n.width : (n.size?.width ?? prevComp?.size?.width ?? def.defaultSize.width);
    let height = n.size?.height ?? prevComp?.size?.height ?? def.defaultSize.height;
    // A frame child the spec says nothing about takes its definition's default position (bottom navigation
    // pinned, FAB bottom right…), like an insert from the library; a free one without x / y is centred.
    if (place.frame && !prev) {
      const pl = n.position === undefined ? def.placement : n.position === 'free' && n.x === undefined && n.y === undefined ? (def.placement?.position === 'free' ? def.placement : { position: 'free' as const, anchor: 'center' as const }) : undefined;
      if (pl) {
        const r = defaultPlacement({ ...def, placement: pl }, props, place.frame);
        if (r) {
          if (n.position === undefined && r.layoutItem) itemBase = r.layoutItem;
          if (pl.position === 'free') {
            at = r.at;
            if (n.width === undefined && n.size === undefined) width = r.width;
          }
        }
      }
    }
    if (typeof n.height === 'number') height = n.height;
    const component: ComponentInfo = { kind: def.kind, props, size: { width, height } };
    node = { ...createGroup({ name: n.name ?? def.label }), id, component };
  } else if (n.form === 'container') {
    const layout: LayoutInfo = { ...defaultLayout(n.kind) };
    if (n.gap !== undefined) layout.gap = n.gap;
    if (n.padding !== undefined) layout.padding = n.padding;
    if (n.align !== undefined) layout.align = n.align;
    if (n.kind === 'grid' && n.columns !== undefined) layout.columns = n.columns;
    if (n.style !== undefined) layout.style = n.style;
    if (n.radius !== undefined) layout.radius = n.radius;
    if (n.repeat !== undefined) layout.repeat = { count: n.repeat };
    const prevSize = prev?.type === 'group' && prev.layout && !prev.symbol ? prev.layout.size : undefined;
    const size = n.size ?? (laid ? undefined : prevSize);
    if (size) layout.size = { ...size };
    const prevGroup = prev?.type === 'group' && !prev.symbol && !prev.component ? prev : undefined;
    const children = buildChildren(n.children, { parentLays: true, prevParent: prevGroup, index: 0, master: place.master, symbol: place.symbol }, ctx);
    node = { ...createGroup({ name: '' }), id, layout, children };
    node.name = n.name ?? defaultName(node);
  } else if (n.form === 'use') {
    const s = findSymbol(ctx.symbols, n.ref);
    if (!s) {
      const names = ctx.symbols.map((x) => `"${x.name}"`).join(', ');
      ctx.issues.push({ path: `${n.path}.use`, message: `no shared component "${n.ref}"${names ? ` (components: ${names})` : ' (define it in "components")'}` });
      return null;
    }
    const shared = s.content.layout;
    const prevSize = prev?.type === 'group' && prev.symbol ? prev.layout?.size : undefined;
    const size = n.size ?? (laid ? undefined : prevSize);
    const layout = shared ? { ...layoutShape(shared), ...(size ? { size: { ...size } } : {}) } : undefined;
    itemBase = s.content.layoutItem ? { ...s.content.layoutItem } : undefined;
    node = {
      ...createGroup({ name: n.name ?? s.name }),
      id,
      ...(layout ? { layout } : {}),
      symbol: { id: s.id },
      // In a master, nested instances are stored without children (materialized from their own master).
      children: place.master ? [] : structuredClone(materializeChildren(s.content, id, ctx.symbols, [s.id])),
    };
  } else {
    const prevGroup = prev?.type === 'group' && !prev.symbol && !prev.component && !prev.layout ? prev : undefined;
    const children = buildChildren(n.children, { parentLays: false, prevParent: prevGroup, index: 0, master: place.master, symbol: place.symbol }, ctx);
    node = { ...createGroup({ name: n.name ?? 'Group' }), id, children };
  }
  node.visible = !n.hidden;
  node.locked = n.locked;
  node.opacity = n.opacity ?? 1;
  node.transform = transformOf(n, prev, at);
  if (prev?.reference) node.reference = prev.reference;
  if (prev?.blendMode) node.blendMode = prev.blendMode;
  const item = layoutItemOf(n, prev, itemBase);
  if (item) node.layoutItem = item;
  if (n.position === 'pinned-bottom' && !place.frame && !place.master) ctx.warnings.push(`${n.path}: "pinned-bottom" only applies to a screen's direct children; here it stays in the flow`);
  collectSugar(n, id, place, ctx);
  return node;
}

function collectSugar(n: NormNode, id: Id, place: Place, ctx: Ctx) {
  if (place.master) {
    // Links in a master apply to every instance (one tab bar, linked once); notes stay on screens.
    if (n.note !== undefined) ctx.issues.push({ path: n.path, message: '"note" inside a shared component would apply to every instance; put it on the screen' });
    for (const o of n.opens) ctx.opens.push({ from: id, to: o.to, ...(o.part !== undefined ? { part: o.part } : {}), symbol: place.symbol, path: `${n.path}.opens${o.part !== undefined ? `.${o.part}` : ''}` });
    return;
  }
  for (const o of n.opens) ctx.opens.push({ from: id, to: o.to, ...(o.part !== undefined ? { part: o.part } : {}), path: `${n.path}.opens${o.part !== undefined ? `.${o.part}` : ''}` });
  if (n.note !== undefined) ctx.notes.push({ on: id, text: n.note, path: `${n.path}.note` });
}

function buildChildren(list: readonly NormNode[], place: Place, ctx: Ctx): SceneNode[] {
  const out: SceneNode[] = [];
  list.forEach((c, i) => {
    const node = buildNode(c, { ...place, index: i }, ctx);
    if (node) out.push(node);
  });
  return out;
}

/**
 * Builds the children of every library component in a tree, at its stored size. The pipeline rebuilds the
 * ones a layout places; this covers the others (hidden ones, which no layout reaches, and masters' content,
 * which instances copy).
 */
function buildComponents(content: GroupNode) {
  const visit = (g: GroupNode) => {
    for (const c of g.children) {
      if (c.type !== 'group') continue;
      if (c.component) buildComponentInto(c as GroupNode & { component: ComponentInfo }, c.component.size);
      else if (!c.symbol) visit(c);
    }
  };
  visit(content);
}

function buildSymbols(spec: NormSpec, existing: DesignDocument | null, ctx: Ctx): WireframeSymbol[] {
  const old = existing?.wireframe?.symbols ?? [];
  if (!spec.components) return structuredClone(old);
  // Ids and names first: masters may use each other in any order.
  const heads = spec.components.map((c) => {
    const match = (c.id !== undefined ? old.find((s) => s.id === c.id) : undefined) ?? old.find((s) => lc(s.name) === lc(c.name));
    return { c, id: c.id ?? match?.id ?? newId('sym'), prev: match };
  });
  // Placeholders while the masters are built; they carry the content's own size and placement, so an instance of
  // one master inside another starts with it (a hug button stays hug), whatever order the masters come in.
  ctx.symbols = heads.map(({ c, id }) => {
    const item = layoutItemOf(c.content, undefined);
    return { id, name: c.name, content: { ...createGroup({ name: c.name }), id, children: [], ...(item ? { layoutItem: item } : {}) } };
  });
  const built = heads.map(({ c, id, prev }) => buildMaster(c, id, prev, ctx));
  ctx.symbols = built;
  // A master may contain other masters, never itself.
  for (const { c, id } of heads) {
    const inner = new Set<Id>();
    walk(built.find((s) => s.id === id)!.content.children, (n) => {
      if (n.type === 'group' && n.symbol) inner.add(n.symbol.id);
    });
    for (const other of inner) if (reaches(built, other, id)) ctx.issues.push({ path: `${c.path}.content`, message: `"${c.name}" contains itself (through "${built.find((s) => s.id === other)?.name}")` });
  }
  return built;
}

function buildMaster(c: NormComponent, id: Id, prev: WireframeSymbol | undefined, ctx: Ctx): WireframeSymbol {
  const index = new Map<Id, SceneNode>();
  if (prev) walk(prev.content.children, (n) => void index.set(n.id, n));
  const node = buildNode({ ...c.content, id }, { parentLays: false, index: 0, master: index, symbol: id, prevParent: undefined }, ctx);
  const content: GroupNode = node && node.type === 'group' ? node : { ...createGroup({ name: c.name }), id, children: [] };
  content.id = id;
  content.name = c.name;
  content.transform = { ...IDENTITY };
  if (content.layout) delete content.layout.size;
  buildComponents(content);
  return { id, name: c.name, content };
}

/** Frame layout from the spec (`undefined` = the platform default, `null` = free content). */
function frameLayout(v: NormVariant): LayoutInfo | null {
  if (v.layout === null) return null;
  const base = defaultScreenLayout(v.platform);
  if (!v.layout) return base;
  const out: LayoutInfo = { ...base };
  if (v.layout.kind !== undefined) out.kind = v.layout.kind;
  if (v.layout.gap !== undefined) out.gap = v.layout.gap;
  if (v.layout.padding !== undefined) out.padding = v.layout.padding;
  if (v.layout.align !== undefined) out.align = v.layout.align;
  if (out.kind === 'grid') out.columns = v.layout.columns ?? 2;
  return out;
}

// ---------- references ("Settings/Language", ids) ----------

interface Resolver {
  resolve(ref: string, path: string): Id | null;
  /** A flow's `from`: a node (canvas, or in a master with `symbol`) and the part after `#`, if any. */
  source(ref: string, path: string): { id: Id; symbol?: Id; part?: string } | null;
  screen(ref: string): WireframeScreen | undefined;
}

/** `"Home/Bottom navigation#Files"` → the path and the part (after the first `#` of the last segment). */
export function splitPart(ref: string): { path: string; part?: string } {
  const i = ref.indexOf('#', ref.lastIndexOf('/') + 1);
  return i < 0 ? { path: ref } : { path: ref.slice(0, i), part: ref.slice(i + 1).trim() };
}

function makeResolver(doc: DesignDocument, ctx: Ctx): Resolver {
  const all = new Map<Id, SceneNode>();
  walk(doc.children, (n) => void all.set(n.id, n));
  const screens = doc.wireframe!.screens;
  const screen = (ref: string) => screens.find((s) => s.id === ref) ?? screens.find((s) => lc(s.name) === lc(ref)) ?? screens.find((s) => screenSlug(s.name) === lc(ref));
  const matches = (n: SceneNode, seg: string) => n.id === seg || lc(n.name) === lc(seg) || lc(flowSourceLabel(doc, n.id)) === lc(seg);
  /** Depth-first, document order; not into generated children or repeat copies. */
  const search = (from: GroupNode, seg: string): SceneNode[] => {
    const hits: SceneNode[] = [];
    walk(from.children, (n) => {
      if (n.repeatCopy) return false;
      if (matches(n, seg)) hits.push(n);
      return !(n.type === 'group' && n.component);
    });
    return hits;
  };
  const symbols = doc.wireframe!.symbols ?? [];
  const masterOf = (ref: string) => symbols.find((x) => x.id === ref) ?? symbols.find((x) => lc(x.name) === lc(ref));
  /** A node of a master's content by id. */
  const inMaster = (id: Id): { symbol: Id; node: SceneNode } | null => {
    for (const m of symbols) {
      let hit: SceneNode | null = null;
      walk(m.content.children, (n) => {
        if (hit) return false;
        if (n.id === id) hit = n;
      });
      if (hit) return { symbol: m.id, node: hit };
    }
    return null;
  };
  /** Within a master: a segment matches a node's id, name or component label (not into components or nested instances). */
  const searchMaster = (from: GroupNode, seg: string): SceneNode[] => {
    const hits: SceneNode[] = [];
    walk(from.children, (n) => {
      if (n.repeatCopy) return false;
      const holder = { children: [n], wireframe: doc.wireframe } as unknown as DesignDocument;
      if (n.id === seg || lc(n.name) === lc(seg) || lc(flowSourceLabel(holder, n.id)) === lc(seg)) hits.push(n);
      return !(n.type === 'group' && (n.component || n.symbol));
    });
    return hits;
  };
  return {
    screen,
    source(ref, path) {
      const { path: nodeRef, part } = splitPart(ref);
      const withPart = (id: Id, node: SceneNode | null, symbol?: Id) => {
        if (part === undefined) return { id, ...(symbol ? { symbol } : {}) };
        const parts = partsOfNode(node);
        const hit = parts.find((p) => p.key === part) ?? parts.find((p) => lc(p.label) === lc(part));
        if (!hit) {
          ctx.issues.push({ path, message: parts.length ? `"${part}" is not a part of "${node?.name}" (parts: ${parts.map((p) => `"${p.label}"`).join(', ')})` : `"${node?.name}" has no parts to link from (only navigation and action components do)` });
          return null;
        }
        return { id, part: hit.key, ...(symbol ? { symbol } : {}) };
      };
      if (all.has(nodeRef)) return withPart(nodeRef, all.get(nodeRef)!);
      const direct = inMaster(nodeRef);
      if (direct) return withPart(nodeRef, direct.node, direct.symbol);
      const segs = nodeRef.split('/').map((x) => x.trim());
      const head = segs[0].split('@')[0].trim();
      const m = !screen(head) && !frames(doc).some((f) => f.id === head) ? masterOf(head) : undefined;
      if (m && segs.length > 1) {
        let cur: SceneNode = m.content;
        for (const seg of segs.slice(1)) {
          const hits: SceneNode[] = cur.type === 'group' ? searchMaster(cur, seg) : [];
          if (!hits.length) {
            ctx.issues.push({ path, message: `"${seg}" matches nothing in shared component "${m.name}"` });
            return null;
          }
          if (hits.length > 1) ctx.warnings.push(`${path}: "${ref}" — "${seg}" matches ${hits.length} nodes; using the first (give the node an "id" to be exact)`);
          cur = hits[0];
        }
        return withPart(cur.id, cur, m.id);
      }
      const id = this.resolve(nodeRef, path);
      return id ? withPart(id, all.get(id) ?? null) : null;
    },
    resolve(ref, path) {
      if (all.has(ref)) return ref;
      const segs = ref.split('/').map((s) => s.trim());
      const [head, platform] = segs[0].split('@').map((s) => s.trim());
      const s = screen(head);
      const frame = s ? frames(doc).find((f) => f.screen.screenId === s.id && (!platform || f.screen.platform === platform)) : frames(doc).find((f) => f.id === head);
      if (!frame) {
        ctx.issues.push({ path, message: s ? `"${head}" has no ${platform} frame` : `no node or screen "${segs.length > 1 ? head : ref}" (a node id, or a path like "Settings/Language")` });
        return null;
      }
      let cur: SceneNode = frame;
      for (const seg of segs.slice(1)) {
        const hits: SceneNode[] = cur.type === 'group' ? search(cur, seg) : [];
        if (!hits.length) {
          ctx.issues.push({ path, message: `"${seg}" matches nothing in "${cur.name}" (a segment matches a node's id, name or label)` });
          return null;
        }
        if (hits.length > 1) ctx.warnings.push(`${path}: "${ref}" — "${seg}" matches ${hits.length} nodes; using the first (give the node an "id" to be exact)`);
        cur = hits[0];
      }
      return cur.id;
    },
  };
}

// ---------- the build ----------

/**
 * Builds a project from a spec (JSON-decoded). With `existing`, updates that project (see the header).
 * Throws `SpecError` listing every problem (spec paths) when the spec is invalid or does not resolve.
 */
export function buildFromSpec(input: unknown, existing?: DesignDocument | null): SpecBuildResult {
  const spec = parseSpec(input);
  return buildFromNormSpec(spec, existing ?? null);
}

export function buildFromNormSpec(spec: NormSpec, existing0: DesignDocument | null): SpecBuildResult {
  if (existing0 && !existing0.wireframe) throw new Error('--into needs a wireframe project');
  const existing = existing0 ? materializeDocument(existing0) : null;
  const ctx: Ctx = { prev: new Map(), claimed: new Set(), symbols: [], issues: [], warnings: [], opens: [], notes: [] };
  if (existing) walk(existing.children, (n) => void ctx.prev.set(n.id, n));
  const claim = (n: NormNode) => {
    if (n.id !== undefined) ctx.claimed.add(n.id);
    if (n.form === 'container' || n.form === 'group') n.children.forEach(claim);
  };
  for (const s of spec.screens) {
    for (const v of s.variants) {
      if (v.id) ctx.claimed.add(v.id);
      v.root.forEach(claim);
    }
  }
  spec.canvas?.forEach(claim);

  const symbols = buildSymbols(spec, existing, ctx);
  ctx.symbols = symbols;

  // Screens and frames.
  const oldScreens = existing?.wireframe?.screens ?? [];
  const oldFrames = existing ? frames(existing) : [];
  const screens: WireframeScreen[] = [];
  const frameNodes: { node: ScreenNode; placed: boolean }[] = [];
  for (const s of spec.screens) {
    const match = (s.id !== undefined ? oldScreens.find((x) => x.id === s.id) : undefined) ?? oldScreens.find((x) => lc(x.name) === lc(s.name));
    const screenId = s.id ?? match?.id ?? newId('s');
    const logical: WireframeScreen = { id: screenId, name: s.name };
    if (s.status) logical.status = s.status;
    screens.push(logical);
    for (const v of s.variants) {
      const prevFrame = (v.id !== undefined ? oldFrames.find((f) => f.id === v.id) : undefined) ?? (match ? oldFrames.find((f) => f.screen.screenId === match.id && f.screen.platform === v.platform && !ctx.claimed.has(f.id)) : undefined);
      if (prevFrame) ctx.claimed.add(prevFrame.id);
      const def = platformDef(v.platform);
      const width = v.width ?? prevFrame?.screen.width ?? def.width;
      const layout = frameLayout(v);
      const x = v.x ?? prevFrame?.transform.x;
      const y = v.y ?? prevFrame?.transform.y;
      const frame = createScreenFrame({ screenId, name: s.name, platform: v.platform, x: x ?? 0, y: y ?? 0, width, layout });
      frame.id = v.id ?? prevFrame?.id ?? newId();
      if (prevFrame) {
        frame.screen.height = Math.max(def.minHeight, prevFrame.screen.height);
        frame.visible = prevFrame.visible;
        frame.locked = prevFrame.locked;
        frame.opacity = prevFrame.opacity;
      }
      frame.children = buildChildren(v.root, { parentLays: !!layout, frame: { width, height: frame.screen.height, layout: !!layout }, prevParent: prevFrame, index: 0 }, ctx);
      frameNodes.push({ node: frame, placed: x !== undefined && y !== undefined });
    }
  }

  // Canvas objects (kept when the spec does not mention the canvas).
  const canvas: SceneNode[] = spec.canvas
    ? buildChildren(spec.canvas, { parentLays: false, index: 0 }, ctx)
    : existing
      ? existing.children.filter((c) => !(c.type === 'group' && (c.screen || c.note))).map((c) => structuredClone(c))
      : [];

  if (ctx.issues.length) throw new SpecError(ctx.issues);

  // Place new frames: a variant next to its screen's other frame, a new screen right of everything.
  const base: DesignDocument = existing
    ? { ...structuredClone(existing), name: spec.name ?? existing.name, updatedAt: Date.now() }
    : createDocument({ name: spec.name ?? 'Wireframe', artboard: { width: 1024, height: 1024, background: { kind: 'none' } } });
  // The project's notes count as taken space too: a new screen never lands on the notes beside the last one.
  const placed: SceneNode[] = [...frameNodes.filter((f) => f.placed).map((f) => f.node), ...canvas, ...(existing ? notesOf(existing) : [])];
  for (const f of frameNodes) {
    if (f.placed) continue;
    const doc = { children: placed, wireframe: { screens } };
    const sibling = placed.find((p): p is ScreenNode => p.type === 'group' && !!p.screen && p.screen.screenId === f.node.screen.screenId);
    const pos = sibling ? variantPosition(doc, sibling, f.node.screen.width, f.node.screen.height) : newScreenPosition(doc);
    f.node.transform = { ...f.node.transform, x: pos.x, y: pos.y };
    placed.push(f.node);
  }

  const keptNotes = !spec.notes && existing ? notesOf(existing).map((n) => structuredClone(n)) : [];
  const keptFlows = !spec.flows && existing ? structuredClone(existing.wireframe?.flows ?? []) : [];
  base.children = [...frameNodes.map((f) => f.node), ...canvas, ...keptNotes];
  buildComponents({ ...createGroup({}), children: base.children });
  base.wireframe = { screens, ...(symbols.length ? { symbols } : {}), ...(keptFlows.length ? { flows: keptFlows } : {}) };

  // First pass: everything laid out, so paths resolve and notes can be placed next to their targets.
  let doc = structuredClone(materializeDocument(base));
  const r = makeResolver(doc, ctx);

  // Flows.
  const oldFlows = existing?.wireframe?.flows ?? [];
  const flows: WireframeFlow[] = keptFlows;
  const sameFlow = (f: WireframeFlow, from: Id, to: Id, part?: string, symbol?: Id) => f.from === from && f.to === to && (f.part ?? null) === (part ?? null) && (f.symbol ?? null) === (symbol ?? null);
  const addFlow = (src0: { id: Id; part?: string; symbol?: Id }, toRef: string, path: string, id?: string, label?: string) => {
    const target = r.screen(toRef);
    if (!target) {
      ctx.issues.push({ path, message: `no screen "${toRef}" (screens: ${screens.map((s) => `"${s.name}"`).join(', ')})` });
      return;
    }
    const src = src0.symbol ? src0.id : flowSource(doc, src0.id);
    if (!src) {
      ctx.issues.push({ path, message: 'the source must be an element inside a screen' });
      return;
    }
    const { part, symbol } = src0;
    const same = flows.find((f) => sameFlow(f, src, target.id, part, symbol));
    if (same) {
      if (label !== undefined) same.label = label;
      return;
    }
    const prevFlow = (id !== undefined ? oldFlows.find((f) => f.id === id) : undefined) ?? oldFlows.find((f) => sameFlow(f, src, target.id, part, symbol));
    flows.push({ id: id ?? prevFlow?.id ?? newId('f'), from: src, to: target.id, ...(label ? { label } : {}), ...(part !== undefined ? { part } : {}), ...(symbol ? { symbol } : {}) });
  };
  /** `opens` sugar: the part is a label or a key of the node's parts. */
  const sugarSource = (o: Ctx['opens'][number]): { id: Id; part?: string; symbol?: Id } | null => {
    if (o.part === undefined) return { id: o.from, ...(o.symbol ? { symbol: o.symbol } : {}) };
    return r.source(`${o.from}#${o.part}`, o.path);
  };
  /** A reference to a node this build removed (it was in the project, the spec dropped it): like a delete in the app, its flows go and its notes detach. */
  const removedRef = (ref: string) => ctx.prev.has(ref) && !findNode(doc, ref);
  for (const f of spec.flows ?? []) {
    if (removedRef(splitPart(f.from).path)) {
      ctx.warnings.push(`${f.path}: its source ${f.from} was removed, so the flow is dropped`);
      continue;
    }
    const from = r.source(f.from, `${f.path}.from`);
    if (from) addFlow(from, f.to, `${f.path}.to`, f.id, f.label);
  }
  for (const o of ctx.opens) {
    const from = sugarSource(o);
    if (from) addFlow(from, o.to, o.path);
  }

  // Notes.
  const oldNotes = existing ? notesOf(existing) : [];
  const notes: NoteNode[] = [];
  const addNote = (text: string, target: Id | undefined, o: { id?: string; x?: number; y?: number }) => {
    const prevNote = (o.id !== undefined ? oldNotes.find((n) => n.id === o.id) : undefined) ?? oldNotes.find((n) => n.note.text === text && n.note.target === target && !notes.some((x) => x.id === n.id));
    const id = o.id ?? prevNote?.id ?? newId('n');
    let x = o.x ?? prevNote?.transform.x;
    let y = o.y ?? prevNote?.transform.y;
    if (x === undefined || y === undefined) {
      const probe = { children: [...doc.children, ...notes], wireframe: doc.wireframe };
      const pos = (target ? notePositionFor(probe, target) : null) ?? belowEverything(probe);
      x ??= pos.x;
      y ??= pos.y;
    }
    notes.push({
      ...createGroup({ name: 'Note' }),
      ...(prevNote ? { visible: prevNote.visible, locked: prevNote.locked } : {}),
      id,
      transform: { ...IDENTITY, x: Math.round(x), y: Math.round(y) },
      note: { text, ...(target ? { target } : {}) },
      children: buildNoteChildren(id, text),
    });
  };
  for (const n of spec.notes ?? []) {
    const gone = n.on !== undefined && removedRef(n.on);
    if (gone) ctx.warnings.push(`${n.path}: the node it was attached to (${n.on}) was removed; the note stays, detached`);
    const target = n.on !== undefined && !gone ? r.resolve(n.on, `${n.path}.on`) : undefined;
    if (target === null) continue;
    addNote(n.text, target, n);
  }
  for (const n of ctx.notes) addNote(n.text, n.on, {});
  if (ctx.issues.length) throw new SpecError(ctx.issues);

  doc.children = [...doc.children.filter((c) => !isNoteNode(c)), ...keptNotes.filter((k) => !notes.some((n) => n.id === k.id)), ...notes];
  doc.wireframe = { ...doc.wireframe!, flows };
  if (!flows.length) delete doc.wireframe.flows;
  if (existing) {
    // Canvas order (z-order) is not in the spec: matched objects keep theirs, new ones go on top.
    const order = new Map(existing.children.map((c, i) => [c.id, i]));
    doc.children = doc.children.map((c, i) => ({ c, k: order.get(c.id) ?? existing.children.length + i })).sort((a, b) => a.k - b.k).map((x) => x.c);
  }
  doc = materializeDocument(doc);

  const now = sourceIds(doc.children);
  const before = existing ? sourceIds(existing.children) : new Set<Id>();
  let added = 0;
  let kept = 0;
  for (const id of now) {
    if (before.has(id)) kept++;
    else added++;
  }
  const removed = [...before].filter((id) => !now.has(id)).length;
  const summary: BuildSummary = {
    screens: doc.wireframe!.screens.length,
    frames: frames(doc).length,
    nodes: [...now].filter((id) => !isTopLevelSpecial(doc, id)).length,
    added,
    removed,
    kept,
  };
  return { doc, warnings: ctx.warnings, summary };
}

const isTopLevelSpecial = (doc: DesignDocument, id: Id) => doc.children.some((c) => c.id === id && c.type === 'group' && (c.screen || c.note));

function belowEverything(doc: Pick<DesignDocument, 'children' | 'wireframe'>): { x: number; y: number } {
  let bottom = 0;
  let left = 0;
  for (const c of doc.children) {
    if (c.type === 'group' && c.screen) bottom = Math.max(bottom, c.transform.y + c.screen.height);
    else if (c.type === 'group' && c.note) bottom = Math.max(bottom, noteRect(c as NoteNode).y + noteRect(c as NoteNode).height);
    left = Math.min(left, c.transform.x);
  }
  return { x: left, y: bottom + 80 };
}
