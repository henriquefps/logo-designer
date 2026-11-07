import type { Artboard } from '@/model';
import { resolvePaint } from './paint';

/** Artboard background; transparent artboards show a checkerboard. */
export function ArtboardRenderer({ artboard }: { artboard: Artboard }) {
  const { width, height, background } = artboard;
  const paint = resolvePaint('artboard', 'bg', background);
  return (
    <g>
      <defs>
        <pattern id="artboard-checker" width={16} height={16} patternUnits="userSpaceOnUse">
          <rect width={16} height={16} fill="#ffffff" />
          <rect width={8} height={8} fill="#e5e5e5" />
          <rect x={8} y={8} width={8} height={8} fill="#e5e5e5" />
        </pattern>
        {paint.def}
      </defs>
      <rect width={width} height={height} fill="url(#artboard-checker)" />
      {background.kind !== 'none' && <rect width={width} height={height} fill={paint.value} fillOpacity={paint.opacity} />}
    </g>
  );
}
