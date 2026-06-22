import JSZip from 'jszip';

// Helper to convert SVG Element to data URL
export function svgToDataUrl(svgElement) {
  const svgClone = svgElement.cloneNode(true);
  
  // Remove selection outlines from clone
  const selectedElements = svgClone.querySelectorAll('.selected');
  selectedElements.forEach(el => {
    el.classList.remove('selected');
    // Remove inline dashed outline styles
    el.style.outline = 'none';
  });

  const svgString = new XMLSerializer().serializeToString(svgClone);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

// Helper to convert SVG to PNG Blob at specific scale
export function svgToPngBlob(svgElement, width, height) {
  return new Promise((resolve, reject) => {
    const dataUrl = svgToDataUrl(svgElement);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/png');
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

// Generate the full ZIP Icon Pack
export async function generateIconPack(svgElement) {
  const zip = new JSZip();

  // 1. Web Icon Pack
  const webFolder = zip.folder('web');
  const webSizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 }
  ];
  for (const item of webSizes) {
    const blob = await svgToPngBlob(svgElement, item.size, item.size);
    webFolder.file(item.name, blob);
  }

  // 2. iOS Icon Pack
  const iosFolder = zip.folder('ios');
  const iosAppIconSet = iosFolder.folder('AppIcon.appiconset');
  const iosSizes = [
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
    { name: 'icon-1024-1x.png', size: 1024, idiom: 'ios-marketing', scale: '1x', size_val: '1024x1024' }
  ];

  const contentsJson = {
    images: [],
    info: {
      version: 1,
      author: 'xcode'
    }
  };

  for (const item of iosSizes) {
    const blob = await svgToPngBlob(svgElement, item.size, item.size);
    iosAppIconSet.file(item.name, blob);
    contentsJson.images.push({
      size: item.size_val,
      idiom: item.idiom,
      filename: item.name,
      scale: item.scale
    });
  }
  iosAppIconSet.file('Contents.json', JSON.stringify(contentsJson, null, 2));

  // 3. Android Icon Pack
  const androidFolder = zip.folder('android');
  const androidMipmaps = [
    { name: 'mipmap-mdpi', size: 48 },
    { name: 'mipmap-hdpi', size: 72 },
    { name: 'mipmap-xhdpi', size: 96 },
    { name: 'mipmap-xxhdpi', size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 }
  ];

  for (const item of androidMipmaps) {
    const folder = androidFolder.folder(item.name);
    // Square launcher icon
    const squareBlob = await svgToPngBlob(svgElement, item.size, item.size);
    folder.file('ic_launcher.png', squareBlob);
    
    // Round launcher icon (clip canvas into a circle on canvas level)
    const roundBlob = await svgToRoundPngBlob(svgElement, item.size);
    folder.file('ic_launcher_round.png', roundBlob);
  }

  // Play Store icon
  const playStoreBlob = await svgToPngBlob(svgElement, 512, 512);
  androidFolder.file('play_store_512.png', playStoreBlob);

  return zip.generateAsync({ type: 'blob' });
}

// Special helper to draw SVG into a circular cropped canvas for Android Round launcher icons
function svgToRoundPngBlob(svgElement, size) {
  return new Promise((resolve, reject) => {
    const dataUrl = svgToDataUrl(svgElement);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      // Draw circular clip path
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Circular Canvas to Blob failed'));
      }, 'image/png');
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}
