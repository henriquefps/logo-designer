import { toast } from 'sonner';
import { installMeasurer } from './measure';
import { isFontFile, uploadFontFiles, useFontStore, type UploadResult } from './store';

export * from './types';
export { BUNDLED_FAMILIES, canonicalFamily } from './catalog';
export { baselineOffset, layoutText, chooseFace, matchWeight } from './layout';
export {
  useFontStore,
  allFamilies,
  findFamily,
  resolveText,
  missingFamilies,
  cssFamily,
  cssFontStack,
  ensureFace,
  ensureTextFont,
  requestFace,
  uploadFontFiles,
  removeUpload,
  renameFamily,
  isFontFile,
  type ResolvedText,
} from './store';
export { textLayout } from './measure';
export { textToPaths } from './outline';

/** Toast summary for an upload. */
export function reportUpload({ added, errors }: UploadResult) {
  if (added.length) {
    const fams = [...new Set(added.map((a) => a.family))];
    toast.success(added.length === 1 ? `Font added: ${fams[0]}` : `${added.length} fonts added: ${fams.join(', ')}`);
  }
  for (const e of errors) toast.error(e);
}

let started = false;
/** Installs the text measurer, loads the uploaded-fonts index and accepts font files dropped on the canvas. */
export function initFonts() {
  if (started) return;
  started = true;
  installMeasurer();
  if (typeof window === 'undefined') return;
  void useFontStore.getState().init();
  const overCanvas = (e: DragEvent) => e.target instanceof Element && !!e.target.closest('[data-slot="canvas"]');
  window.addEventListener('dragover', (e) => {
    if (overCanvas(e) && e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  window.addEventListener(
    'drop',
    (e) => {
      if (!overCanvas(e)) return;
      const files = [...(e.dataTransfer?.files ?? [])];
      const fonts = files.filter(isFontFile);
      if (!fonts.length) return;
      e.preventDefault();
      // Fonts only: other files (SVG, images) are left to the importers.
      if (fonts.length === files.length) e.stopImmediatePropagation();
      void uploadFontFiles(fonts).then(reportUpload);
    },
    true,
  );
}
