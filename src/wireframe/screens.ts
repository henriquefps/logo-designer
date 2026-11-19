// Screens of wireframe documents: frames, logical screens and variants (docs/wireframe-mode.md →
// Screens). Pure functions on plain documents or immer drafts; the app (commands.ts) and the CLI
// both use them.
import {
  boundsIn,
  createGroup,
  fromTransform,
  isScreenNode,
  newId,
  platformDef,
  rectsIntersect,
  unionRects,
  worldBounds,
  type DesignDocument,
  type GroupNode,
  type Id,
  type LayoutInfo,
  type Rect,
  type ScreenNode,
  type ScreenPlatform,
  type WireframeScreen,
} from '@/model';
import { defaultScreenLayout } from './layout';
import { plain } from './types';

/** Space between screens placed by the app (new screens, variants). */
export const SCREEN_GAP = 80;

type DocLike = Pick<DesignDocument, 'children' | 'wireframe'>;

/** Top-level screen frames, in document order. */
export const frames = (doc: DocLike): ScreenNode[] => doc.children.filter(isScreenNode);

/** The frame's rectangle in document space (frames are translation-only). */
export const frameRect = (n: ScreenNode): Rect => ({ x: n.transform.x, y: n.transform.y, width: n.screen.width, height: n.screen.height });

/** Lowest edge of the visible content in the frame's local space (0 when empty). */
export function contentBottom(frame: GroupNode): number {
  let bottom = 0;
  for (const c of frame.children) {
    if (!c.visible || c.reference) continue;
    const b = boundsIn(c, fromTransform(c.transform));
    if (b) bottom = Math.max(bottom, b.y + b.height);
  }
  return bottom;
}

/**
 * The frame's height: grows with the content, never below the platform minimum. A frame with a
 * `layout` gets its height from the layout step; then only the minimum is enforced here.
 */
export function screenHeight(frame: ScreenNode): number {
  const min = platformDef(frame.screen.platform).minHeight;
  if (frame.layout) return Math.max(min, frame.screen.height);
  return Math.max(min, Math.ceil(contentBottom(frame) - 1e-6));
}

export const logicalScreen = (doc: DocLike, screenId: Id): WireframeScreen | undefined => doc.wireframe?.screens.find((s) => s.id === screenId);

/** Frames of one logical screen. */
export const variantsOf = (doc: DocLike, screenId: Id): ScreenNode[] => frames(doc).filter((f) => f.screen.screenId === screenId);

/** Platforms a logical screen has no frame for yet. */
export function freePlatforms(doc: DocLike, screenId: Id): ScreenPlatform[] {
  const used = new Set(variantsOf(doc, screenId).map((f) => f.screen.platform));
  return (['phone', 'tablet', 'desktop'] as const).filter((p) => !used.has(p));
}

/** `base`, or `base 2`, `base 3`… when a logical screen already has that name. */
export function uniqueScreenName(doc: DocLike, base: string): string {
  const taken = new Set((doc.wireframe?.screens ?? []).map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

export const nextScreenName = (doc: DocLike) => uniqueScreenName(doc, `Screen ${(doc.wireframe?.screens.length ?? 0) + 1}`);

/**
 * A new frame (not yet in a document). Its height is the platform minimum until the pipeline runs.
 * Its content is a vertical stack (`defaultScreenLayout`) unless `layout: null` (free content).
 */
export function createScreenFrame(o: { screenId: Id; name: string; platform: ScreenPlatform; x: number; y: number; width?: number; layout?: LayoutInfo | null }): ScreenNode {
  const def = platformDef(o.platform);
  const g = createGroup({ name: o.name, transform: { x: o.x, y: o.y } });
  const frame: ScreenNode = { ...g, screen: { screenId: o.screenId, platform: o.platform, width: o.width ?? def.width, height: def.minHeight } };
  const layout = o.layout === undefined ? defaultScreenLayout(o.platform) : o.layout;
  if (layout) frame.layout = layout;
  return frame;
}

function topLevelRects(doc: DocLike, exclude?: Id): Rect[] {
  const d = doc as DesignDocument;
  return doc.children
    .filter((n) => n.visible && n.id !== exclude)
    .map((n) => (isScreenNode(n) ? frameRect(n) : worldBounds(d, n.id)))
    .filter((r): r is Rect => !!r);
}

/** Top-left for a new screen: right of everything on the canvas, aligned with the screens' top. */
export function newScreenPosition(doc: DocLike): { x: number; y: number } {
  const all = unionRects(topLevelRects(doc));
  if (!all) return { x: 0, y: 0 };
  const screens = frames(doc);
  const y = screens.length ? Math.min(...screens.map((s) => s.transform.y)) : all.y;
  return { x: Math.round(all.x + all.width + SCREEN_GAP), y: Math.round(y) };
}

/** Top-left for a variant of `source`: to its right, moved further right past anything in the way. */
export function variantPosition(doc: DocLike, source: ScreenNode, width: number, height: number): { x: number; y: number } {
  const rects = topLevelRects(doc, source.id);
  let x = source.transform.x + source.screen.width + SCREEN_GAP;
  const y = source.transform.y;
  for (let guard = 0; guard < 1000; guard++) {
    const box = { x, y, width, height };
    const hit = rects.filter((r) => rectsIntersect(r, box) && r.x + r.width > x);
    if (!hit.length) break;
    x = Math.max(...hit.map((r) => r.x + r.width)) + SCREEN_GAP;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Adds a frame (mutates `doc`, a draft or a fresh copy). Without `screenId` it starts a new logical
 * screen named `name` (default "Screen N"); with one, it adds a variant and fails if that platform
 * already has a frame. Returns the new frame's node id.
 */
export function addScreen(doc: DocLike, o: { platform: ScreenPlatform; name?: string; screenId?: Id; x?: number; y?: number; width?: number; layout?: LayoutInfo | null }): Id {
  const wf = doc.wireframe;
  if (!wf) throw new Error('Not a wireframe document.');
  let logical: WireframeScreen;
  if (o.screenId) {
    const found = logicalScreen(doc, o.screenId);
    if (!found) throw new Error(`No logical screen ${o.screenId}.`);
    if (!freePlatforms(doc, o.screenId).includes(o.platform)) throw new Error(`“${found.name}” already has a ${o.platform} frame.`);
    logical = found;
  } else {
    logical = { id: newId('s'), name: o.name?.trim() ? uniqueScreenName(doc, o.name.trim()) : nextScreenName(doc) };
    wf.screens.push(logical);
  }
  const pos = o.x !== undefined && o.y !== undefined ? { x: o.x, y: o.y } : newScreenPosition(doc);
  const frame = createScreenFrame({ screenId: logical.id, name: logical.name, platform: o.platform, x: pos.x, y: pos.y, width: o.width, layout: o.layout });
  doc.children.push(frame);
  return frame.id;
}

/**
 * "Duplicate as tablet / desktop / phone": a plain copy of the frame's content as another variant
 * of the same logical screen, placed next to it (nothing is converted). Returns the new frame id,
 * or null when that platform already has a frame.
 */
export function duplicateScreenAs(doc: DocLike, frameId: Id, platform: ScreenPlatform): Id | null {
  const source = frames(doc).find((f) => f.id === frameId);
  if (!source || !freePlatforms(doc, source.screen.screenId).includes(platform)) return null;
  const def = platformDef(platform);
  const height = Math.max(def.minHeight, source.screen.height);
  const pos = variantPosition(doc, source, def.width, height);
  const copy = structuredClone(plain(source)) as ScreenNode;
  const ids = new Map<Id, Id>();
  const renew = (n: { id: Id; children?: unknown }) => {
    const id = newId();
    ids.set(n.id, id);
    n.id = id;
    if (Array.isArray(n.children)) (n.children as { id: Id }[]).forEach(renew);
  };
  renew(copy);
  // The copies open the same screens as their originals (flows point at logical screens).
  const flows = doc.wireframe?.flows;
  if (flows) {
    for (const f of [...flows]) {
      const from = ids.get(f.from);
      if (from && from !== copy.id) flows.push({ id: newId('f'), from, to: f.to, ...(f.label ? { label: f.label } : {}) });
    }
  }
  copy.transform = { ...copy.transform, x: pos.x, y: pos.y, rotation: 0, scaleX: 1, scaleY: 1 };
  copy.screen = { ...copy.screen, platform, width: def.width, height: def.minHeight };
  // A stack with the source platform's default spacing gets the target platform's.
  const from = defaultScreenLayout(source.screen.platform);
  if (copy.layout && copy.layout.padding === from.padding && copy.layout.gap === from.gap) {
    const to = defaultScreenLayout(platform);
    copy.layout = { ...copy.layout, padding: to.padding, gap: to.gap };
  }
  doc.children.push(copy);
  return copy.id;
}

/** The screen frame that contains `id` (the frame itself, or an ancestor), or null. */
export function frameOf(doc: DocLike, id: Id): ScreenNode | null {
  for (const f of frames(doc)) {
    if (f.id === id) return f;
    let found = false;
    const visit = (n: GroupNode) => {
      for (const c of n.children) {
        if (found) return;
        if (c.id === id) found = true;
        else if (c.type === 'group') visit(c);
      }
    };
    visit(f);
    if (found) return f;
  }
  return null;
}

/** Union of the visible top-level content (what "fit to view" shows in a wireframe document). */
export function contentRect(doc: DocLike): Rect | null {
  return unionRects(topLevelRects(doc));
}

/** The frame whose name strip (`strip` document units tall, just above the frame) contains `p`. */
export function screenLabelAt(doc: DocLike, p: { x: number; y: number }, strip: number): Id | null {
  for (const f of [...frames(doc)].reverse()) {
    if (!f.visible || f.locked) continue;
    const r = frameRect(f);
    if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y - strip && p.y < r.y) return f.id;
  }
  return null;
}

/** File-name slug of a screen name: `Settings / Language` → `settings-language`. */
export function screenSlug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'screen'
  );
}

/** Frames matching a logical screen name (case-insensitive) and/or a platform. No name = every frame. */
export function findFrames(doc: DocLike, name?: string, platform?: ScreenPlatform): ScreenNode[] {
  const wanted = name?.trim().toLowerCase();
  return frames(doc).filter((f) => (!wanted || f.name.toLowerCase() === wanted || screenSlug(f.name) === wanted) && (!platform || f.screen.platform === platform));
}
