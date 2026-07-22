import { buildFontFaceCss } from './embedFonts';

/**
 * Serializes a live <svg> element (selection outlines stripped) to a Blob URL.
 * Using a Blob instead of a `data:` URI (the v1 approach) avoids the practical
 * URL-length ceilings some browsers impose once an element embeds a large
 * base64 <image>. Callers must call the returned `revoke()` after the image
 * has loaded to avoid leaking the object URL.
 *
 * Any text element's font is embedded as a base64 @font-face (see embedFonts.ts) so the
 * result renders correctly standalone — neither a bare .svg file nor an <img>-rasterized
 * PNG/WebP/JPG has access to this page's own stylesheets once it leaves this document.
 */
export async function svgToBlobUrl(svgElement: SVGSVGElement): Promise<{ url: string; revoke: () => void }> {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  clone.querySelectorAll('.selected, [data-selection-overlay]').forEach((el) => el.remove());

  const fontCss = await buildFontFaceCss(clone);
  if (fontCss) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = fontCss;
    clone.insertBefore(style, clone.firstChild);
  }

  const svgString = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err instanceof Error ? err : new Error('Failed to load SVG for rasterization'));
    img.src = url;
  });
}

/**
 * Rasterizes the SVG to a Blob at the given size and format. Because the SVG's
 * <clipPath> (used for the canvas background shape) is inline, not an external
 * reference, the raster output respects it automatically — no separate clip
 * logic needed here.
 */
export async function svgToBlob(
  svgElement: SVGSVGElement,
  width: number,
  height: number,
  mime: 'image/png' | 'image/webp' | 'image/jpeg' = 'image/png',
  quality?: number,
): Promise<Blob> {
  const { url, revoke } = await svgToBlobUrl(svgElement);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    if (mime === 'image/jpeg') {
      // JPEG has no alpha channel — flatten onto white first.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas to Blob failed'))), mime, quality);
    });
  } finally {
    revoke();
  }
}

/** Rasterizes to a Blob clipped to a circle — used for Android round launcher icons. */
export async function svgToRoundBlob(svgElement: SVGSVGElement, size: number): Promise<Blob> {
  const { url, revoke } = await svgToBlobUrl(svgElement);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Circular canvas to Blob failed'))), 'image/png');
    });
  } finally {
    revoke();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
