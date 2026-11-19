import { useProjectsStore } from '@/store/useProjectsStore';

/**
 * The editor holds a placeholder document until the saved project has been read from IndexedDB
 * (`useProjectsStore.ready`). A pointer press in that window acted on the placeholder and was lost
 * when the real document replaced it (the "first click on a freshly loaded page is swallowed").
 * The canvas ignores input until this is true.
 */
export const acceptsCanvasInput = () => useProjectsStore.getState().ready;
