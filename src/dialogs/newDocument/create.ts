// New document dialog → the document of the chosen mode. Every mode reuses the still-empty
// document opened on a first visit instead of leaving an extra empty project behind.
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { freeSize, type FreeOptions, type ModeOptions } from './modes';

/** Free project: an artboard of the chosen size (a preset or a custom size). */
export async function createFreeDocument(o: FreeOptions) {
  const { width, height } = freeSize(o);
  const name = o.name.trim();
  const ds = useDocStore.getState();
  const pristine = ds.doc.children.length === 0 && ds.past.length === 0 && ds.future.length === 0;
  if (pristine) {
    // An empty, untouched document (the one opened on first visit, or an empty icon just made): size
    // and name it, and drop another mode's marker. Its name is kept only if it was a free project too.
    const { icon, wireframe, ...base } = ds.doc;
    const next = { ...base, name: name || (icon || wireframe ? 'Untitled' : ds.doc.name), artboard: { ...ds.doc.artboard, width, height }, updatedAt: Date.now() };
    ds.load(next);
    useEditorStore.getState().fitRect({ x: 0, y: 0, width, height });
    if (next.name !== ds.doc.name) await useProjectsStore.getState().rename(next.id, next.name);
    await useProjectsStore.getState().flush();
  } else {
    await useProjectsStore.getState().create(name || 'Untitled', { width, height });
  }
}

/** Creates (and opens) the document a New document choice describes. */
export async function createDocument(o: ModeOptions) {
  switch (o.mode) {
    case 'free':
      return createFreeDocument(o);
    case 'icon': {
      const { createIconDocument } = await import('@/iconMode/document');
      return createIconDocument(o.preset, { name: o.name, shape: o.shape, tile: o.tile, colour: o.colour, glyph: o.glyph });
    }
    case 'wireframe': {
      const { createWireframeDocument } = await import('@/wireframe/commands');
      return createWireframeDocument({ name: o.name, platform: o.platform });
    }
  }
}
