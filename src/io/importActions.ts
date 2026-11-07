// Glue between parsers and the stores: import SVG/image files or text into the active document,
// or open an SVG as a new document.
import { toast } from 'sonner';
import {
  applyWorldMatrix,
  createDocument,
  createGroup,
  createImage,
  IDENTITY,
  multiply,
  rectCenter,
  scale,
  translate,
  unionRects,
  boundsIn,
  fromTransform,
  type SceneNode,
  type Vec,
} from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { loadImage } from './rasterExport';
import { parseSvg } from './svgImport';

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
export const SVG_ACCEPT = '.svg,image/svg+xml';
export const MAX_IMAGE_SIDE = 2048;

const baseName = (file: string) => file.replace(/\.[^.]+$/, '') || 'Imported';
export const isSvgFile = (f: File) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg');
export const isImageFile = (f: File) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);

/**
 * Places nodes (in their own coordinates) into the document: centered at `at` (default: artboard
 * center), scaled down to fit the artboard when larger. Several nodes are wrapped in a group.
 */
export function placeNodes(nodes: SceneNode[], name: string, at?: Vec): SceneNode[] {
  const { doc } = useDocStore.getState();
  const b = unionRects(nodes.map((n) => boundsIn(n, fromTransform(n.transform))));
  if (!b) return [];
  const { width: aw, height: ah } = doc.artboard;
  const k = Math.min(1, (aw * 0.9) / Math.max(b.width, 1e-6), (ah * 0.9) / Math.max(b.height, 1e-6));
  const target = at ?? { x: aw / 2, y: ah / 2 };
  const c = rectCenter(b);
  const m = multiply(translate(target.x, target.y), multiply(scale(k), translate(-c.x, -c.y)));
  // A single node absorbs the scale (bakeScale); several are wrapped in a group.
  if (nodes.length === 1) return [applyWorldMatrix(nodes[0], IDENTITY, m)];
  return [applyWorldMatrix(createGroup({ name, children: nodes }), IDENTITY, m)];
}

function addAndSelect(nodes: SceneNode[], label: string) {
  if (!nodes.length) return [];
  const ids = useDocStore.getState().addNodes(nodes, { label });
  useEditorStore.getState().setSelection(ids);
  return ids;
}

/** Imports SVG markup into the active document. Returns false when it is not SVG. */
export function importSvgText(text: string, name = 'Imported SVG', at?: Vec): boolean {
  let result;
  try {
    result = parseSvg(text);
  } catch {
    return false;
  }
  if (!result.nodes.length) {
    toast.info('This SVG has nothing to import.');
    return true;
  }
  addAndSelect(placeNodes(result.nodes, name, at), `Import ${name}`);
  for (const w of result.warnings) toast.warning(w);
  return true;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file.'));
    r.readAsDataURL(blob);
  });

/** Reads an image file as a data URL, downscaled so its longest side is at most MAX_IMAGE_SIDE. */
export async function imageFileToDataUrl(file: Blob): Promise<{ href: string; width: number; height: number }> {
  const src = await readAsDataUrl(file);
  const img = await loadImage(src);
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
  if (k === 1) return { href: src, width: w, height: h };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { href: src, width: w, height: h };
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = file.type === 'image/jpeg';
  return { href: canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9), width: canvas.width, height: canvas.height };
}

export async function importImageFile(file: File, at?: Vec) {
  const { href, width, height } = await imageFileToDataUrl(file);
  const node = createImage({ name: baseName(file.name), href, width, height });
  addAndSelect(placeNodes([node], node.name, at), `Import ${node.name}`);
}

/** Imports any mix of SVG and image files. Reports unsupported files. */
export async function importFiles(files: File[], at?: Vec) {
  let skipped = 0;
  for (const file of files) {
    try {
      if (isSvgFile(file)) {
        if (!importSvgText(await file.text(), baseName(file.name), at)) toast.error(`“${file.name}” is not a valid SVG file.`);
      } else if (isImageFile(file)) await importImageFile(file, at);
      else skipped++;
    } catch (e) {
      toast.error(`Could not import “${file.name}”`, { description: e instanceof Error ? e.message : undefined });
    }
  }
  if (skipped) toast.info(skipped === 1 ? 'One file was skipped: only SVG, PNG, JPG and WebP can be imported.' : `${skipped} files were skipped: only SVG, PNG, JPG and WebP can be imported.`);
}

/** Opens SVG markup as a new project; the artboard comes from the viewBox. */
export async function openSvgAsDocument(text: string, name: string) {
  const result = parseSvg(text);
  let { width, height } = result;
  const children = result.nodes;
  if (!(width > 0) || !(height > 0)) {
    // No viewBox/size: fit the artboard to the content.
    const b = unionRects(children.map((n) => boundsIn(n, fromTransform(n.transform))));
    width = Math.max(1, Math.ceil(b ? b.x + b.width : 1024));
    height = Math.max(1, Math.ceil(b ? b.y + b.height : 1024));
  }
  const doc = createDocument({ name, artboard: { width, height, background: { kind: 'none' } }, children });
  await useProjectsStore.getState().importDocument(doc);
  for (const w of result.warnings) toast.warning(w);
  toast.success(`Opened “${name}”`);
}

export async function openSvgFileAsDocument(file: File) {
  try {
    await openSvgAsDocument(await file.text(), baseName(file.name));
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not open this SVG.');
  }
}

/**
 * Places an image as a tracing reference: fitted (contain) and centered in the artboard,
 * bottom-most, locked, half transparent. Never hit-tested nor exported.
 */
export async function placeReferenceImage(file: File) {
  try {
    const { href, width, height } = await imageFileToDataUrl(file);
    const { width: aw, height: ah } = useDocStore.getState().doc.artboard;
    const k = Math.min(aw / width, ah / height);
    const node = createImage({
      name: `Reference – ${file.name}`,
      href,
      width: width * k,
      height: height * k,
      opacity: 0.5,
      locked: true,
      reference: true,
      transform: { x: aw / 2, y: ah / 2 },
    });
    useDocStore.getState().addNodes([node], { index: 0, label: 'Place reference image' });
    useEditorStore.getState().clearSelection();
    toast.success('Reference placed', { description: 'Select it from the Layers panel. It is not exported.' });
  } catch (e) {
    toast.error(`Could not place “${file.name}”`, { description: e instanceof Error ? e.message : undefined });
  }
}
