import type { SceneNode, TextNode } from '@/model';
import { textToPaths } from '@/fonts/outline';

/** Text outlining is always available (fonts module). Kept for callers that check it. */
export const hasTextOutlining = () => true;

/** Text → glyph paths through `src/fonts/outline.ts`. Returns null (caller emits live `<text>`) when it fails. */
export async function outlineText(node: TextNode): Promise<SceneNode | null> {
  try {
    return await textToPaths(node);
  } catch (e) {
    console.warn('Text outlining failed; exporting live text instead.', e);
    return null;
  }
}
