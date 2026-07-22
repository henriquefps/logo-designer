import interWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import spaceGroteskWoff2 from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url';
import playfairDisplayWoff2 from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url';
import jetbrainsMonoWoff2 from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import bebasNeueWoff2 from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url';

interface FontFile {
  url: string;
  weightRange: string;
  variable: boolean;
}

/** Latin-subset file + native weight range per font, matching each @fontsource package's own
 * @font-face declaration — kept in sync with the families offered in lib/fonts.ts. */
const FONT_FILES: Record<string, FontFile> = {
  'Inter Variable': { url: interWoff2, weightRange: '100 900', variable: true },
  'Space Grotesk Variable': { url: spaceGroteskWoff2, weightRange: '300 700', variable: true },
  'Playfair Display Variable': { url: playfairDisplayWoff2, weightRange: '400 900', variable: true },
  'JetBrains Mono Variable': { url: jetbrainsMonoWoff2, weightRange: '100 800', variable: true },
  'Bebas Neue': { url: bebasNeueWoff2, weightRange: '400', variable: false },
};

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
