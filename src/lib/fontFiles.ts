import interWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import spaceGroteskWoff2 from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url';
import playfairDisplayWoff2 from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url';
import jetbrainsMonoWoff2 from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import bebasNeueWoff2 from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url';

export interface FontFile {
  url: string;
  weightRange: string;
  variable: boolean;
}

/** Latin-subset file + native weight range per font, matching each @fontsource package's own
 * @font-face declaration — kept in sync with the families offered in lib/fonts.ts. Shared by
 * export's @font-face embedding (lib/export/embedFonts.ts) and "convert text to path"
 * (lib/textToPath.ts), which parses the same woff2 bytes as real glyph outlines. */
export const FONT_FILES: Record<string, FontFile> = {
  'Inter Variable': { url: interWoff2, weightRange: '100 900', variable: true },
  'Space Grotesk Variable': { url: spaceGroteskWoff2, weightRange: '300 700', variable: true },
  'Playfair Display Variable': { url: playfairDisplayWoff2, weightRange: '400 900', variable: true },
  'JetBrains Mono Variable': { url: jetbrainsMonoWoff2, weightRange: '100 800', variable: true },
  'Bebas Neue': { url: bebasNeueWoff2, weightRange: '400', variable: false },
};
