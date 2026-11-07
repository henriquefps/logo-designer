import { useState } from 'react';
import { joinColor, normalizeHex, splitColor } from '@/model';
import { cn } from '@/lib/utils';
import { useDocStore } from '@/store/useDocStore';
import { NumberField } from './NumberField';

interface ColorFieldProps {
  /** #rrggbb or #rrggbbaa */
  value: string;
  onChange: (color: string) => void;
  ariaLabel: string;
  showAlpha?: boolean;
  className?: string;
}

/** Swatch (native color picker) + hex input + alpha %. Picker drags are one undo step. */
export function ColorField({ value, onChange, ariaLabel, showAlpha = true, className }: ColorFieldProps) {
  const { color, opacity } = splitColor(value);
  const [draft, setDraft] = useState<string | null>(null);

  const commitHex = (text: string) => {
    setDraft(null);
    const hex = normalizeHex(text);
    if (!hex) return;
    // A 6-digit entry keeps the current alpha.
    onChange(hex.length === 9 ? hex : joinColor(hex, opacity));
  };

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <label
        className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input shadow-xs"
        style={{
          backgroundImage: 'repeating-conic-gradient(var(--muted) 0% 25%, var(--card) 0% 50%)',
          backgroundSize: '8px 8px',
        }}
      >
        <span className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
          type="color"
          aria-label={ariaLabel}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          value={color}
          onPointerDown={() => useDocStore.getState().beginTransaction('Change color')}
          onBlur={() => useDocStore.getState().commitTransaction()}
          onChange={(e) => onChange(joinColor(e.target.value, opacity))}
        />
      </label>
      <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        <span className="pl-2 font-mono text-xs text-muted-foreground">#</span>
        <input
          aria-label={`${ariaLabel} hex`}
          className="h-full w-full min-w-0 bg-transparent px-1 font-mono text-[0.8125rem] uppercase outline-none"
          value={draft ?? color.slice(1)}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commitHex(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      {showAlpha && (
        <NumberField
          className="w-20 shrink-0"
          ariaLabel={`${ariaLabel} opacity`}
          value={Math.round(opacity * 100)}
          suffix="%"
          min={0}
          max={100}
          precision={0}
          onCommit={(v) => onChange(joinColor(color, v / 100))}
        />
      )}
    </div>
  );
}
