import type { SceneNode, TextNode } from '@/model';

/**
 * Adapter to the typography module's `textToPaths(node)` in `src/fonts/outline.ts`. The glob makes
 * this file pick that module up as soon as it exists, without an import that would break the build
 * before it lands. Returns null (caller emits live `<text>`) when it is missing or fails.
 */
type OutlineModule = { textToPaths?: (node: TextNode) => Promise<SceneNode> };
const modules = import.meta.glob<OutlineModule>('../fonts/outline.ts');

export const hasTextOutlining = () => Object.keys(modules).length > 0;

export async function outlineText(node: TextNode): Promise<SceneNode | null> {
  const load = Object.values(modules)[0];
  if (!load) return null;
  try {
    const mod = await load();
    return mod.textToPaths ? await mod.textToPaths(node) : null;
  } catch (e) {
    console.warn('Text outlining failed; exporting live text instead.', e);
    return null;
  }
}
