import JSZip from 'jszip';
import { svgToBlob, svgToRoundBlob } from './svgSerialize';

const WEB_SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

const IOS_SIZES = [
  { name: 'icon-20-2x.png', size: 40, idiom: 'iphone', scale: '2x', size_val: '20x20' },
  { name: 'icon-20-3x.png', size: 60, idiom: 'iphone', scale: '3x', size_val: '20x20' },
  { name: 'icon-29-1x.png', size: 29, idiom: 'iphone', scale: '1x', size_val: '29x29' },
  { name: 'icon-29-2x.png', size: 58, idiom: 'iphone', scale: '2x', size_val: '29x29' },
  { name: 'icon-29-3x.png', size: 87, idiom: 'iphone', scale: '3x', size_val: '29x29' },
  { name: 'icon-40-2x.png', size: 80, idiom: 'iphone', scale: '2x', size_val: '40x40' },
  { name: 'icon-40-3x.png', size: 120, idiom: 'iphone', scale: '3x', size_val: '40x40' },
  { name: 'icon-60-2x.png', size: 120, idiom: 'iphone', scale: '2x', size_val: '60x60' },
  { name: 'icon-60-3x.png', size: 180, idiom: 'iphone', scale: '3x', size_val: '60x60' },
  { name: 'icon-20-1x-ipad.png', size: 20, idiom: 'ipad', scale: '1x', size_val: '20x20' },
  { name: 'icon-20-2x-ipad.png', size: 40, idiom: 'ipad', scale: '2x', size_val: '20x20' },
  { name: 'icon-29-1x-ipad.png', size: 29, idiom: 'ipad', scale: '1x', size_val: '29x29' },
  { name: 'icon-29-2x-ipad.png', size: 58, idiom: 'ipad', scale: '2x', size_val: '29x29' },
  { name: 'icon-40-1x-ipad.png', size: 40, idiom: 'ipad', scale: '1x', size_val: '40x40' },
  { name: 'icon-40-2x-ipad.png', size: 80, idiom: 'ipad', scale: '2x', size_val: '40x40' },
  { name: 'icon-76-1x-ipad.png', size: 76, idiom: 'ipad', scale: '1x', size_val: '76x76' },
  { name: 'icon-76-2x-ipad.png', size: 152, idiom: 'ipad', scale: '2x', size_val: '76x76' },
  { name: 'icon-83.5-2x-ipad.png', size: 167, idiom: 'ipad', scale: '2x', size_val: '83.5x83.5' },
  { name: 'icon-1024-1x.png', size: 1024, idiom: 'ios-marketing', scale: '1x', size_val: '1024x1024' },
];

const ANDROID_MIPMAPS = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 },
];

/**
 * Builds a full web/iOS/Android icon pack ZIP from the live canvas SVG.
 * Android round icons always use a circular clip regardless of the user's
 * chosen canvas background shape — that's a platform requirement, not a
 * reflection of the design's own shape.
 */
export async function generateIconPack(svgElement: SVGSVGElement): Promise<Blob> {
  const zip = new JSZip();

  const webFolder = zip.folder('web')!;
  for (const item of WEB_SIZES) {
    const blob = await svgToBlob(svgElement, item.size, item.size);
    webFolder.file(item.name, blob);
  }

  const iosFolder = zip.folder('ios')!;
  const iosAppIconSet = iosFolder.folder('AppIcon.appiconset')!;
  const contentsJson = {
    images: [] as { size: string; idiom: string; filename: string; scale: string }[],
    info: { version: 1, author: 'xcode' },
  };
  for (const item of IOS_SIZES) {
    const blob = await svgToBlob(svgElement, item.size, item.size);
    iosAppIconSet.file(item.name, blob);
    contentsJson.images.push({ size: item.size_val, idiom: item.idiom, filename: item.name, scale: item.scale });
  }
  iosAppIconSet.file('Contents.json', JSON.stringify(contentsJson, null, 2));

  const androidFolder = zip.folder('android')!;
  for (const item of ANDROID_MIPMAPS) {
    const folder = androidFolder.folder(item.name)!;
    const squareBlob = await svgToBlob(svgElement, item.size, item.size);
    folder.file('ic_launcher.png', squareBlob);
    const roundBlob = await svgToRoundBlob(svgElement, item.size);
    folder.file('ic_launcher_round.png', roundBlob);
  }
  const playStoreBlob = await svgToBlob(svgElement, 512, 512);
  androidFolder.file('play_store_512.png', playStoreBlob);

  return zip.generateAsync({ type: 'blob' });
}
