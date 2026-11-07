// PNG / JPG from the exported SVG via an <img> + canvas (browser only).

export type RasterFormat = 'png' | 'jpg';

export interface RasterOptions {
  format: RasterFormat;
  /** Output pixel size. */
  width: number;
  height: number;
  /** JPG quality 0..1. */
  quality?: number;
  /** Fill painted under the image (JPG always gets one: white when not given). */
  background?: string | null;
}

/** Largest canvas side browsers reliably support. */
export const MAX_RASTER_SIDE = 16384;

/** Output pixel size for a scale factor or a custom width (keeps the aspect ratio). */
export function rasterSize(area: { width: number; height: number }, sizing: { scale?: number; width?: number }) {
  const k = sizing.width && sizing.width > 0 ? sizing.width / area.width : (sizing.scale ?? 1);
  let w = Math.max(1, Math.round(area.width * k));
  let h = Math.max(1, Math.round(area.height * k));
  const over = Math.max(w, h) / MAX_RASTER_SIDE;
  if (over > 1) {
    w = Math.max(1, Math.floor(w / over));
    h = Math.max(1, Math.floor(h / over));
  }
  return { width: w, height: h };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be rendered.'));
    img.src = src;
  });
}

export const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });

export async function rasterizeSvg(svg: string, opts: RasterOptions): Promise<Blob> {
  const url = URL.createObjectURL(svgBlob(svg));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = opts.width;
    canvas.height = opts.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    const bg = opts.format === 'jpg' ? (opts.background ?? '#ffffff') : opts.background;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, opts.width, opts.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, opts.width, opts.height);
    const mime = opts.format === 'jpg' ? 'image/jpeg' : 'image/png';
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image is too large to export.'))), mime, opts.quality ?? 0.92),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
