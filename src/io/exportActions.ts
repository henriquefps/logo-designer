import { toast } from 'sonner';
import { paintPrimaryColor, skippedReferenceNodes, skippedReferenceNotice, splitColor, type DesignDocument, type Id } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { downloadBlob, safeFileName } from './download';
import { rasterizeSvg, rasterSize, svgBlob, type RasterFormat } from './rasterExport';
import { exportSvg } from './svgExport';

export type ExportFormat = 'svg' | RasterFormat;

export interface ExportSettings {
  format: ExportFormat;
  scope: 'artboard' | 'selection';
  selection: Id[];
  padding: number;
  /** Include the artboard background (artboard scope). */
  background: boolean;
  /** Raster sizing: a scale factor, or a custom pixel width when set. */
  scale: number;
  customWidth?: number;
  /** JPG quality 0..1. */
  quality: number;
}

export interface ExportOutput {
  blob: Blob;
  svg: string;
  /** Pixel size for rasters, document units for SVG. */
  width: number;
  height: number;
  filename: string;
}

/** Background fill for JPG: the artboard color when it is solid, else white. */
function jpgBackground(doc: DesignDocument, s: ExportSettings) {
  const bg = doc.artboard.background;
  if (s.scope === 'artboard' && s.background && bg.kind !== 'none') return splitColor(paintPrimaryColor(bg) ?? '#ffffff').color;
  return '#ffffff';
}

export async function renderExport(doc: DesignDocument, s: ExportSettings, name = doc.name): Promise<ExportOutput> {
  const { svg, width, height } = await exportSvg(doc, {
    scope: s.scope,
    selection: s.selection,
    padding: s.padding,
    background: s.scope === 'artboard' ? s.background : false,
  });
  const base = safeFileName(name);
  if (s.format === 'svg') return { blob: svgBlob(svg), svg, width, height, filename: `${base}.svg` };
  const size = rasterSize({ width, height }, { scale: s.scale, width: s.customWidth });
  const blob = await rasterizeSvg(svg, {
    format: s.format,
    width: size.width,
    height: size.height,
    quality: s.quality,
    background: s.format === 'jpg' ? jpgBackground(doc, s) : null,
  });
  return { blob, svg, width: size.width, height: size.height, filename: `${base}.${s.format}` };
}

export async function downloadExport(doc: DesignDocument, s: ExportSettings, name?: string) {
  const out = await renderExport(doc, s, name);
  downloadBlob(out.blob, out.filename);
  return out;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies the selection (or the whole artboard when nothing is selected) as SVG markup. */
export async function copySvgToClipboard(): Promise<void> {
  const doc = useDocStore.getState().doc;
  const selection = useEditorStore.getState().selection;
  try {
    const { svg } = await exportSvg(doc, { scope: selection.length ? 'selection' : 'artboard', selection });
    const notice = skippedReferenceNotice(skippedReferenceNodes(doc, selection.length ? selection : undefined));
    if (await copyText(svg)) toast.success(selection.length ? 'Selection copied as SVG' : 'Artboard copied as SVG', notice ? { description: notice } : undefined);
    else toast.error('The clipboard is not available here.');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not copy SVG.');
  }
}
