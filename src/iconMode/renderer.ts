// Browser renderer for the icon module (src/icon): SVG → offscreen canvas → pixels / PNG.
import type { IconRenderer, Raster } from '@/icon';
import { loadImage, svgBlob } from '@/io/rasterExport';

/** Sets the root <svg>'s width/height so the browser rasterizes the vector at the target size. */
function sized(svg: string, width: number, height: number): string {
  return svg.replace(/^<svg\b([^>]*)>/, (_m, attrs: string) => {
    const rest = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${rest} width="${width}" height="${height}">`;
  });
}

async function draw(svg: string, width: number, height: number): Promise<CanvasRenderingContext2D> {
  const url = URL.createObjectURL(svgBlob(sized(svg, width, height)));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return ctx;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toPng(ctx: CanvasRenderingContext2D): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    ctx.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function canvasRasterize(svg: string, px: number): Promise<Raster> {
  const ctx = await draw(svg, px, px);
  const { data, width, height } = ctx.getImageData(0, 0, px, px);
  return { data, width, height, channels: 4 };
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const browserIconRenderer: IconRenderer = {
  rasterize: canvasRasterize,
  png: async (svg, size) => toPng(await draw(svg, size, size)),
  pngAt: async (svg, width, height) => toPng(await draw(svg, width, height)),
  deflate,
};
