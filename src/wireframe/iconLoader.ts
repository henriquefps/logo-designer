// App side of wireframe icons (see ./icons.ts): loads glyphs from the icon libraries (Lucide bundled,
// Iconify fetched, through src/assets-icons) into the pure cache, so component builds can draw them.
//
// - `ensureIcons(names)` before an edit or an insert that needs an icon (the properties panel, the
//   library panel): the build then draws the real glyph in the same undo step.
// - `startIconLoader()` (App) watches for builds that drew a placeholder (a file made by the CLI, a
//   pasted instance) and rebuilds those instances once the glyphs are loaded: silently when there is
//   no history yet (just opened), else as an undo step "Load icons".
import { walk, type DesignDocument, type Id, type SceneNode } from '@/model';
import { bundledSvg } from '@/assets-icons/catalog';
import { fetchIconifySvg } from '@/assets-icons/iconify';
import { svgToNodes } from '@/assets-icons/svgToNodes';
import { useDocStore } from '@/store/useDocStore';
import { hasIcon, ICON_GLYPH_SIZE, iconKeyOf, normalizeIconName, registerIcon, takeMissingIcons } from './icons';

const failed = new Set<string>();
const inflight = new Map<string, Promise<boolean>>();

async function loadOne(key: string): Promise<boolean> {
  if (hasIcon(key)) return true;
  if (failed.has(key)) return false;
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      try {
        const svg = key.startsWith('lucide:') ? await bundledSvg(key.slice(7)) : await fetchIconifySvg(key.slice(8));
        const node = svgToNodes(svg, { color: '#000000', size: ICON_GLYPH_SIZE, name: key });
        if (!node) throw new Error('no drawable shapes');
        registerIcon(key, node);
        return true;
      } catch (e) {
        console.warn(`Wireframe icon ${key} could not be loaded`, e);
        failed.add(key);
        return false;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
  }
  return p;
}

/** Loads the glyphs for these icon names (any accepted spelling; '' ignored). Resolves when done, never rejects. */
export async function ensureIcons(names: readonly string[]): Promise<void> {
  const keys = [...new Set(names.map(normalizeIconName).filter(Boolean))];
  await Promise.all(keys.map(loadOne));
}

/** Instances whose generated children draw one of `keys` as a placeholder. */
function instancesWithPending(doc: DesignDocument, keys: Set<string>): Id[] {
  const out: Id[] = [];
  walk(doc.children, (n: SceneNode) => {
    if (n.type !== 'group' || !n.component) return;
    let hit = false;
    walk(n.children, (c) => {
      if (!hit && c.type === 'group' && c.name.startsWith('icon?:') && keys.has(iconKeyOf(c) ?? '')) hit = true;
    });
    if (hit) out.push(n.id);
  });
  return out;
}

/** Watches the document for placeholder icons and fills them in. Returns the unsubscribe. */
export function startIconLoader(): () => void {
  let busy = false;
  const check = async () => {
    if (busy) return;
    const missing = takeMissingIcons().filter((k) => !failed.has(k));
    if (!missing.length) return;
    busy = true;
    try {
      await ensureIcons(missing);
      const loaded = new Set(missing.filter(hasIcon));
      if (!loaded.size) return;
      const ds = useDocStore.getState();
      if (!ds.doc.wireframe) return;
      const ids = instancesWithPending(ds.doc, loaded);
      if (!ids.length) return;
      if (!ds.past.length && !ds.txn) {
        // Just opened: re-materialize without an undo step.
        ds.load(ds.doc);
      } else {
        // A new `component` object makes the pipeline rebuild the instance (same values).
        ds.updateNodes(
          ids,
          (n) => {
            if (n.type === 'group' && n.component) n.component = { ...n.component };
          },
          { label: 'Load icons' },
        );
      }
    } finally {
      busy = false;
    }
  };
  void check();
  const unsub = useDocStore.subscribe((s, prev) => {
    if (s.doc === prev.doc || s.txn || !s.doc.wireframe) return;
    void check();
  });
  return unsub;
}
