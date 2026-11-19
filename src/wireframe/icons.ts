// Icons inside wireframe components (the `icon` prop type). Pure: the pipeline and the CLI use it.
//
// An icon prop holds a name from the app's icon libraries, in the Icons panel's key format:
// `lucide:Heart` (bundled), `iconify:ph:heart` (Phosphor and other Iconify sets). Shorthands are
// accepted from files, the CLI and AI: `heart` / `arrow-right` / `ArrowRight` → Lucide, `ph:heart` →
// Iconify. '' means no icon.
//
// `build()` is synchronous, but icon SVGs load asynchronously (Lucide is a lazy chunk, Iconify is
// fetched). So glyphs live in a cache filled by the app (`src/wireframe/iconLoader.ts`, before an
// edit or an insert that needs them) and by `harvestIcons`, which picks the glyphs back up from an
// instance's stored children before it is rebuilt: a file opened anywhere (app, CLI, tests) keeps the
// icons it was saved with. A glyph not in the cache is drawn as a placeholder and reported by
// `takeMissingIcons()`; the app loads it and rebuilds the instances that use it.
import type { Paint, SceneNode, Stroke } from '@/model';

const RESOLVED = 'icon:';
const PENDING = 'icon?:';

const pascal = (s: string) =>
  s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');

/** Canonical icon key (`lucide:Heart`, `iconify:ph:heart`), or '' for none. */
export function normalizeIconName(name: string): string {
  const n = name.trim();
  if (!n) return '';
  if (n.startsWith('lucide:')) return `lucide:${pascal(n.slice(7))}`;
  if (n.startsWith('iconify:')) return n;
  if (n.includes(':')) return `iconify:${n}`;
  return `lucide:${pascal(n)}`;
}

/** Display name of an icon key: `lucide:ArrowRight` → `ArrowRight`, `iconify:ph:heart` → `ph:heart`. */
export const iconDisplayName = (key: string) => normalizeIconName(key).replace(/^(lucide|iconify):/, '');

/** Normalised glyphs: centred on the origin, 24 px on the longest side. */
const cache = new Map<string, SceneNode>();
const missing = new Set<string>();

export const ICON_GLYPH_SIZE = 24;

/** Stores a glyph (centred on the origin, `ICON_GLYPH_SIZE` px). */
export function registerIcon(name: string, glyph: SceneNode) {
  cache.set(normalizeIconName(name), glyph);
}

export const hasIcon = (name: string) => cache.has(normalizeIconName(name));

/** The cached glyph, or null (and the name is remembered as missing). */
export function iconGlyph(name: string): SceneNode | null {
  const key = normalizeIconName(name);
  const g = cache.get(key);
  if (!g && key) missing.add(key);
  return g ?? null;
}

/** Icon names `build()` asked for that were not in the cache since the last call (and clears the list). */
export function takeMissingIcons(): string[] {
  const out = [...missing].filter((k) => !cache.has(k));
  missing.clear();
  return out;
}

/** Name of the node the kit draws for an icon: resolved glyph or placeholder. */
export const iconNodeName = (key: string, resolved: boolean) => (resolved ? RESOLVED : PENDING) + key;

/** The icon key a kit icon node was drawn for (resolved or not), or null when the node is not one. */
export function iconKeyOf(node: SceneNode): string | null {
  if (node.type !== 'group') return null;
  if (node.name.startsWith(RESOLVED)) return node.name.slice(RESOLVED.length);
  if (node.name.startsWith(PENDING)) return node.name.slice(PENDING.length);
  return null;
}

/** Copies resolved glyphs found in (stored) generated children into the cache. Returns how many. */
export function harvestIcons(nodes: readonly SceneNode[]): number {
  let n = 0;
  const visit = (list: readonly SceneNode[]) => {
    for (const c of list) {
      if (c.type !== 'group') continue;
      if (c.name.startsWith(RESOLVED) && c.children[0]) {
        const key = c.name.slice(RESOLVED.length);
        if (!cache.has(key)) {
          cache.set(key, c.children[0]);
          n++;
        }
        continue;
      }
      visit(c.children);
    }
  };
  visit(nodes);
  return n;
}

/** Every icon key used by the given nodes' kit icons (resolved or not). */
export function iconKeysIn(nodes: readonly SceneNode[], out = new Set<string>()): Set<string> {
  for (const c of nodes) {
    const k = iconKeyOf(c);
    if (k) out.add(k);
    else if (c.type === 'group') iconKeysIn(c.children, out);
  }
  return out;
}

const recolorPaint = (p: Paint, color: string): Paint => (p.kind === 'none' ? p : { kind: 'solid', color });

/** The glyph with every painted fill/stroke in `color` (wireframes are greyscale). */
export function recolor(node: SceneNode, color: string): SceneNode {
  if (node.type === 'group') return { ...node, children: node.children.map((c) => recolor(c, color)) };
  if (node.type === 'image') return node;
  const stroke: Stroke = { ...node.stroke, paint: recolorPaint(node.stroke.paint, color) };
  return { ...node, fill: recolorPaint(node.fill, color), stroke } as SceneNode;
}

/** For tests: empty the cache. */
export function clearIconCache() {
  cache.clear();
  missing.clear();
}
