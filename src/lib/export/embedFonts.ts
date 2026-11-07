import { FONT_FILES } from '@/lib/fontFiles';

const base64Cache = new Map<string, Promise<string>>();

async function toBase64DataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:font/woff2;base64,${btoa(binary)}`;
}

function getBase64(url: string): Promise<string> {
  let cached = base64Cache.get(url);
  if (!cached) {
    cached = toBase64DataUri(url);
    base64Cache.set(url, cached);
  }
  return cached;
}

/**
 * Builds @font-face rules (fonts embedded as base64 data URIs) for exactly the font families
 * used by <text> elements in the given SVG. Exported SVG/PNG/WebP/JPG all rasterize or get
 * opened outside this page's own stylesheet context, so without this, custom fonts silently
 * fall back to a generic serif/sans — this makes the exported file self-contained instead.
 */
export async function buildFontFaceCss(svg: SVGSVGElement): Promise<string> {
  const usedFamilies = new Set<string>();
  svg.querySelectorAll('text[font-family]').forEach((el) => {
    const family = el.getAttribute('font-family');
    if (family) usedFamilies.add(family);
  });
  if (usedFamilies.size === 0) return '';

  const rules = await Promise.all(
    Array.from(usedFamilies).map(async (family) => {
      const font = FONT_FILES[family];
      if (!font) return '';
      const dataUri = await getBase64(font.url);
      const format = font.variable ? 'woff2-variations' : 'woff2';
      return `@font-face { font-family: '${family}'; src: url(${dataUri}) format('${format}'); font-weight: ${font.weightRange}; font-display: swap; }`;
    }),
  );
  return rules.filter(Boolean).join('\n');
}
