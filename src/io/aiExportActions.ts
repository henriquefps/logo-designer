// File → Export for AI… and Edit → Copy for AI (wireframe documents). See src/wireframe/aiExport.ts.
import { toast } from 'sonner';
import { aiMarkdownCombined, aiProjectSlug, aiZip } from '@/wireframe/aiExport';
import { useDocStore } from '@/store/useDocStore';
import { downloadBlob } from './download';
import { copyText, renderExport } from './exportActions';

export async function exportForAi(): Promise<void> {
  const doc = useDocStore.getState().doc;
  if (!doc.wireframe) return;
  const id = toast.loading('Preparing the package for AI…');
  try {
    const zip = await aiZip(doc, async (frame) => {
      const out = await renderExport(doc, { format: 'png', scope: 'screen', screenId: frame.id, selection: [], padding: 0, background: false, scale: 1, quality: 1 });
      return new Uint8Array(await out.blob.arrayBuffer());
    });
    const filename = `${aiProjectSlug(doc)}-for-ai.zip`;
    downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), filename);
    toast.success(`Saved ${filename}`, { id });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not export for AI.', { id });
  }
}

export async function copyForAi(): Promise<void> {
  const doc = useDocStore.getState().doc;
  if (!doc.wireframe) return;
  try {
    const text = aiMarkdownCombined(doc);
    if (await copyText(text)) toast.success('Copied for AI', { description: 'Screens and notes as markdown (no images).' });
    else toast.error('The clipboard is not available here.');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not copy for AI.');
  }
}
