// Icon commands shared by actions, the icon panel, the Export icon dialog and the App icon exporter.
import { toast } from 'sonner';
import { buildIconSet, type IconSetResult } from '@/icon';
import type { DesignDocument } from '@/model';
import { downloadBlob, safeFileName } from '@/io/download';
import { PROJECT_EXTENSION, serializeProject } from '@/io/projectFile';
import { loadDocument } from '@/store/persistence';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { measureDocument } from './analysis';
import { fittedNodes } from './fit';
import { glyphFragment } from './glyph';
import { browserIconRenderer } from './renderer';

/** Scales and centres the glyph onto its keyline (one undo step). */
export async function fitToKeyline(): Promise<boolean> {
  const doc = useDocStore.getState().doc;
  if (!doc.icon) return false;
  const a = await measureDocument(doc);
  if (!a.box) {
    toast.error('Draw a glyph first: there is no visible ink to fit.');
    return false;
  }
  if (useDocStore.getState().doc !== doc) return false; // changed while measuring
  const nodes = fittedNodes(doc, a.box);
  if (!nodes.length) return false;
  useDocStore.getState().replaceNodes(nodes, { label: 'Fit to keyline' });
  return true;
}

/** The linked small-glyph project's fragment (favicon), when there is one. */
export async function smallGlyphOf(doc: DesignDocument): Promise<{ glyph: string; doc: DesignDocument } | null> {
  const id = doc.icon?.smallGlyphProjectId;
  if (!id || id === doc.id) return null;
  await useProjectsStore.getState().flush();
  const small = await loadDocument(id);
  if (!small) return null;
  const glyph = await glyphFragment(small);
  return glyph ? { glyph, doc: small } : null;
}

const svgFile = (text: string) => new Blob([text], { type: 'image/svg+xml;charset=utf-8' });

/** Downloads glyph.svg (and glyph-small.svg when a small glyph is linked). */
export async function downloadGlyph(doc: DesignDocument) {
  const glyph = await glyphFragment(doc);
  if (!glyph) throw new Error('The glyph is empty: draw something first.');
  downloadBlob(svgFile(glyph), 'glyph.svg');
  const small = await smallGlyphOf(doc);
  if (small) downloadBlob(svgFile(small.glyph), 'glyph-small.svg');
}

/** Builds the whole icon set in the browser (same files as build-icons.mjs) plus glyph + project. */
export async function buildIconZip(doc: DesignDocument): Promise<{ blob: Blob; result: IconSetResult; filename: string }> {
  const glyph = await glyphFragment(doc);
  if (!glyph) throw new Error('The glyph is empty: draw something first.');
  const small = await smallGlyphOf(doc);
  const base = safeFileName(doc.name);
  const extra = [{ path: base + PROJECT_EXTENSION, data: serializeProject(doc) }];
  if (small) extra.push({ path: safeFileName(small.doc.name) + '-small' + PROJECT_EXTENSION, data: serializeProject(small.doc) });
  const result = await buildIconSet({ glyph, small: small?.glyph, shape: doc.icon?.shape ?? 'auto', extra }, browserIconRenderer);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const f of result.files) zip.file(f.path, f.data);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, result, filename: `${base}-icons.zip` };
}

export async function downloadIconZip(doc: DesignDocument) {
  const { blob, filename, result } = await buildIconZip(doc);
  downloadBlob(blob, filename);
  return result;
}
