import { BRAND, FAVICON_RX, iconTile, isFaviconPreset, LIGHT_BORDER, TILE_RX } from '@/icon';
import { useDocStore } from '@/store/useDocStore';
import { useIconStore } from '../store';
import { GLYPH_FILTER_ID } from '../hooks';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/**
 * The brand tile under the artwork of an icon document (world coordinates). A reference only:
 * it is not a document node, so it is never selected or exported. Also defines the filter that
 * previews the glyph in white (or brand blue on the light variant), keeping its alpha.
 */
export function IconTileLayer() {
  const icon = useDocStore((s) => s.doc.icon);
  const artboard = useDocStore((s) => s.doc.artboard);
  const showTile = useIconStore((s) => s.showTile);
  const light = useIconStore((s) => s.light);
  if (!icon || !showTile) return null;
  const t = iconTile(icon.preset, artboard);
  const rx = ((isFaviconPreset(icon.preset) ? FAVICON_RX : TILE_RX) / 128) * t.size;
  const [r, g, b] = rgb(light ? BRAND : '#ffffff');
  const android = icon.preset === 'android-adaptive';
  const k = t.size / 128;
  return (
    <g pointerEvents="none" aria-hidden="true" data-slot="icon-tile">
      <defs>
        <filter id={GLYPH_FILTER_ID} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={`0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0`} />
        </filter>
      </defs>
      {android && !light ? (
        // Adaptive background layer: full bleed over the 108 canvas; the launcher masks it.
        <rect width={artboard.width} height={artboard.height} fill={BRAND} />
      ) : light ? (
        <rect x={t.x + k} y={t.y + k} width={t.size - 2 * k} height={t.size - 2 * k} rx={Math.max(rx - k, 0)} fill="#fff" stroke={LIGHT_BORDER} strokeWidth={2 * k} />
      ) : (
        <rect x={t.x} y={t.y} width={t.size} height={t.size} rx={rx} fill={BRAND} />
      )}
    </g>
  );
}
