import { CURATED_PALETTE } from '@/lib/palettes';
import { cn } from '@/lib/utils';

export function PaletteSwatches({ onPick, recent = [] }: { onPick: (hex: string) => void; recent?: string[] }) {
  const colors = [...recent, ...CURATED_PALETTE.filter((c) => !recent.includes(c))];
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((hex) => (
        <button
          key={hex}
          type="button"
          title={hex}
          onClick={() => onPick(hex)}
          className={cn('size-6 shrink-0 rounded-full border border-border transition-transform hover:scale-110')}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}
