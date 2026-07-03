const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

/**
 * Downscales large uploads to at most 512px on the long edge and re-encodes
 * as JPEG (or keeps PNG for images with transparency), before they're stored
 * as base64 in project state. The original app stored raw uploads verbatim,
 * which could blow well past localStorage's ~5MB quota with a single photo.
 */
export function compressImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the selected image.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const keepsTransparency = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
        const mime = keepsTransparency ? 'image/png' : 'image/jpeg';
        resolve({ dataUrl: canvas.toDataURL(mime, JPEG_QUALITY), width, height });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
