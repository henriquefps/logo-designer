import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { evalMath } from '@/lib/evalMath';
import { useDocStore } from '@/store/useDocStore';

export interface NumberFieldProps {
  /** null = mixed values. */
  value: number | null;
  onCommit: (value: number) => void;
  /** Short prefix label (e.g. "X") or icon; dragging it scrubs the value. */
  label?: ReactNode;
  ariaLabel: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  className?: string;
  disabled?: boolean;
  /** Undo label for scrubbing. */
  undoLabel?: string;
}

const clamp = (v: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, v));

/**
 * Numeric input that commits on Enter/blur, steps with ↑/↓ (Shift ×10) and scrubs by dragging
 * its label (one undo step per scrub). Accepts simple math ("10*2", "+5").
 */
export function NumberField({
  value,
  onCommit,
  label,
  ariaLabel,
  suffix,
  step = 1,
  min,
  max,
  precision = 2,
  className,
  disabled,
  undoLabel = 'Change',
}: NumberFieldProps) {
  const fmt = (v: number | null) => (v === null ? '' : String(Math.round(v * 10 ** precision) / 10 ** precision));
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; v: number } | null>(null);
  // Enter commits and then blurs: the blur must not commit again (its props are still the old ones,
  // so relative edits such as W or X would be applied twice).
  const skipBlur = useRef(false);

  const commit = (text: string) => {
    setDraft(null);
    const t = text.trim();
    if (!t) return;
    const next = evalMath(t);
    if (Number.isFinite(next)) onCommit(clamp(next, min, max));
  };

  return (
    <div
      className={cn(
        'flex h-8 min-w-0 items-center rounded-md border border-input bg-transparent text-sm shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {label !== undefined && (
        <span
          className="flex h-full min-w-7 shrink-0 cursor-ew-resize items-center justify-center pl-1 text-muted-foreground select-none [&_svg]:size-4"
          onPointerDown={(e) => {
            if (value === null) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub.current = { x: e.clientX, v: value };
            useDocStore.getState().beginTransaction(undoLabel);
          }}
          onPointerMove={(e) => {
            if (!scrub.current) return;
            const dx = e.clientX - scrub.current.x;
            const s = e.shiftKey ? step * 10 : step;
            onCommit(clamp(scrub.current.v + Math.round(dx / 2) * s, min, max));
          }}
          onPointerUp={() => {
            scrub.current = null;
            useDocStore.getState().commitTransaction();
          }}
        >
          {label}
        </span>
      )}
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        className="h-full w-full min-w-0 bg-transparent px-2 text-sm tabular-nums outline-none placeholder:text-muted-foreground"
        value={draft ?? fmt(value)}
        placeholder={value === null ? 'Mixed' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          if (skipBlur.current) skipBlur.current = false;
          else commit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
            skipBlur.current = true;
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(null);
            skipBlur.current = true;
            e.currentTarget.blur();
          } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
            e.preventDefault();
            const s = (e.shiftKey ? 10 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1);
            setDraft(null);
            onCommit(clamp(value + s, min, max));
          }
        }}
      />
      {suffix && <span className="pr-2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}
