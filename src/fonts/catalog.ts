import type { FontFamilyInfo, FontFaceInfo, FontMetrics, WeightRange } from './types';
import archivoBlack from './files/archivo-black-regular.ttf?url';
import bebasNeue from './files/bebas-neue-regular.ttf?url';
import dmSerifDisplay from './files/dm-serif-display-regular.ttf?url';
import inter from './files/inter-variable.ttf?url';
import jetbrainsMono from './files/jetbrains-mono-variable.ttf?url';
import lora from './files/lora-variable.ttf?url';
import montserrat from './files/montserrat-variable.ttf?url';
import pacifico from './files/pacifico-regular.ttf?url';
import playfairDisplay from './files/playfair-display-variable.ttf?url';
import spaceGrotesk from './files/space-grotesk-variable.ttf?url';

/**
 * Bundled open fonts (SIL OFL 1.1, licenses in ./files/licenses, sourced from google/fonts).
 * The same TTF serves on-canvas rendering (FontFace) and outlining (opentype.js), so both match.
 * Metrics are copied from each file's hhea table so baselines are right before the file loads.
 */
interface BundledSpec {
  slug: string;
  family: string;
  url: string;
  weight: WeightRange;
  metrics: FontMetrics;
  category: FontFamilyInfo['category'];
  opsz?: [number, number];
  /** Old names that map to this family (LogoGo / @fontsource family names). */
  aliases?: string[];
}

const m = (unitsPerEm: number, ascender: number, descender: number): FontMetrics => ({ unitsPerEm, ascender, descender });

const SPECS: BundledSpec[] = [
  { slug: 'inter', family: 'Inter', url: inter, weight: [100, 900], metrics: m(2048, 1984, -494), category: 'sans', opsz: [14, 32], aliases: ['Inter Variable'] },
  { slug: 'space-grotesk', family: 'Space Grotesk', url: spaceGrotesk, weight: [300, 700], metrics: m(1000, 984, -292), category: 'sans', aliases: ['Space Grotesk Variable'] },
  { slug: 'montserrat', family: 'Montserrat', url: montserrat, weight: [100, 900], metrics: m(1000, 968, -251), category: 'sans' },
  { slug: 'archivo-black', family: 'Archivo Black', url: archivoBlack, weight: [400, 400], metrics: m(1000, 878, -210), category: 'display' },
  { slug: 'bebas-neue', family: 'Bebas Neue', url: bebasNeue, weight: [400, 400], metrics: m(1000, 900, -300), category: 'display' },
  { slug: 'playfair-display', family: 'Playfair Display', url: playfairDisplay, weight: [400, 900], metrics: m(1000, 1082, -251), category: 'serif', aliases: ['Playfair Display Variable'] },
  { slug: 'dm-serif-display', family: 'DM Serif Display', url: dmSerifDisplay, weight: [400, 400], metrics: m(1000, 1036, -335), category: 'serif' },
  { slug: 'lora', family: 'Lora', url: lora, weight: [400, 700], metrics: m(1000, 1006, -274), category: 'serif' },
  { slug: 'pacifico', family: 'Pacifico', url: pacifico, weight: [400, 400], metrics: m(1000, 1303, -453), category: 'script' },
  { slug: 'jetbrains-mono', family: 'JetBrains Mono', url: jetbrainsMono, weight: [100, 800], metrics: m(1000, 1020, -300), category: 'mono', aliases: ['JetBrains Mono Variable'] },
];

export const BUNDLED_FAMILIES: FontFamilyInfo[] = SPECS.map((s) => ({
  family: s.family,
  source: 'bundled',
  category: s.category,
  faces: [{ key: `bundled:${s.slug}`, family: s.family, weight: s.weight, style: 'normal', metrics: s.metrics, opsz: s.opsz } satisfies FontFaceInfo],
}));

const URLS = new Map(SPECS.map((s) => [`bundled:${s.slug}`, s.url]));
export const bundledUrl = (key: string) => URLS.get(key);

const ALIASES = new Map<string, string>(SPECS.flatMap((s) => (s.aliases ?? []).map((a) => [a.toLowerCase(), s.family] as const)));
/** Maps legacy names ("Inter Variable") to the bundled family name. */
export const canonicalFamily = (family: string) => ALIASES.get(family.toLowerCase()) ?? family;
