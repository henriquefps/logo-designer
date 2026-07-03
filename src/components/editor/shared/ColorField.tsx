import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PaletteSwatches } from './PaletteSwatches';

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  showPalette?: boolean;
}

/**
 * Native <input type="color"> fires `input` continuously while the picker is open
 * and `change` once when it closes — that maps directly onto our live/commit
 * gesture split, no extra plumbing needed.
 */
export function ColorField({ label, value, onChange, onCommit, showPalette = true }: ColorFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="w-20 shrink-0 text-xs text-muted-foreground">{label}</Label>
        <div className="relative size-8 shrink-0 overflow-hidden rounded-md border border-input">
          <input
            type="color"
            value={value}
            onInput={(e) => onChange(e.currentTarget.value)}
            onChange={onCommit}
            className="absolute -left-1 -top-1 size-10 cursor-pointer border-0 p-0"
          />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          className="h-8 font-mono text-xs"
          spellCheck={false}
        />
      </div>
      {showPalette && (
        <PaletteSwatches
          onPick={(hex) => {
            onChange(hex);
            onCommit();
          }}
        />
      )}
    </div>
  );
}
