/**
 * Serializes a live <svg> element (selection outlines stripped) to a Blob URL.
 * Using a Blob instead of a `data:` URI (the v1 approach) avoids the practical
 * URL-length ceilings some browsers impose once an element embeds a large
 * base64 <image>. Callers must call the returned `revoke()` after the image
 * has loaded to avoid leaking the object URL.
 */
export function svgToBlobUrl(svgElement: SVGSVGElement): { url: string; revoke: () => void } {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  clone.querySelectorAll('.selected, [data-selection-overlay]').forEach((el) => el.remove());

  const svgString = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/**
 * Rasterizes the SVG to a Blob at the given size and format. Because the SVG's
 * <clipPath> (used for the canvas background shape) is inline, not an external
 * reference, the raster output respects it automatically — no separate clip
 * logic needed here.
 */
export function svgToBlob(
  svgElement: SVGSVGElement,
  width: number,
  height: number,
  mime: 'image/png' | 'image/webp' | 'image/jpeg' = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { url, revoke } = svgToBlobUrl(svgElement);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        revoke();
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      if (mime === 'image/jpeg') {
        // JPEG has no alpha channel — flatten onto white first.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          revoke();
          if (blob) resolve(blob);
          else reject(new Error('Canvas to Blob failed'));
        },
        mime,
        quality,
      );
    };
    img.onerror = (err) => {
      revoke();
      reject(err instanceof Error ? err : new Error('Failed to load SVG for rasterization'));
    };
    img.src = url;
  });
}

/** Rasterizes to a Blob clipped to a circle — used for Android round launcher icons. */
export function svgToRoundBlob(svgElement: SVGSVGElement, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { url, revoke } = svgToBlobUrl(svgElement);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        revoke();
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        revoke();
        if (blob) resolve(blob);
        else reject(new Error('Circular canvas to Blob failed'));
      }, 'image/png');
    };
    img.onerror = (err) => {
      revoke();
      reject(err instanceof Error ? err : new Error('Failed to load SVG for rasterization'));
    };
    img.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
