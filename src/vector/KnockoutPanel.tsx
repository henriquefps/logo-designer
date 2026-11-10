import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { NumberField } from '@/panels/shared/NumberField';
import { useDocStore } from '@/store/useDocStore';
import { gapUnit } from './knockout';
import { cancelKnockout, commitKnockout, knockoutTxnLost, setKnockoutGap, setKnockoutOutlineOnly, useKnockout } from './knockoutSession';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Floating panel over the canvas while a knockout is being previewed: gap (slider + field, live),
 * Cancel and Apply. Enter applies, Escape cancels.
 */
export function KnockoutPanel() {
  const open = useKnockout((s) => s.open);
  const gap = useKnockout((s) => s.gap);
  const changed = useKnockout((s) => s.changed);
  const outlineOnly = useKnockout((s) => s.outlineOnly);
  const txn = useDocStore((s) => s.txn);
  const icon = useDocStore((s) => s.doc.icon);
  const artboard = useDocStore((s) => s.doc.artboard);

  // Another gesture or undo committed the transaction: the session is over.
  useEffect(() => {
    if (open) knockoutTxnLost();
  }, [open, txn]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelKnockout();
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        e.stopPropagation();
        commitKnockout();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;
  const unit = gapUnit({ icon, artboard });
  const iconDoc = unit.label === 'T';
  const value = unit.fromDoc(gap);
  const max = iconDoc ? 0.12 : 32;
  const step = iconDoc ? 0.005 : 0.5;
  return (
    <div
      role="dialog"
      aria-label="Knock out"
      className="absolute top-4 right-4 z-20 flex w-[min(22rem,calc(100%-2rem))] flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-md"
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onContextMenu={stop}
      onWheel={stop}
      onDoubleClick={stop}
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Knock out</span>
        <span className="text-xs text-muted-foreground">
          The top object cuts {changed === 1 ? 'one object' : `${changed} objects`} behind it. It stays as it is.
        </span>
      </div>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_6rem] items-center gap-3">
        <span className="text-sm text-muted-foreground">Gap</span>
        <Slider aria-label="Gap" min={0} max={max} step={step} value={[Math.min(value, max)]} onValueChange={([v]) => setKnockoutGap(unit.toDoc(v))} />
        <NumberField
          ariaLabel="Gap value"
          value={Math.round(value * 1000) / 1000}
          min={0}
          step={step}
          precision={iconDoc ? 3 : 2}
          suffix={unit.label}
          onCommit={(v) => setKnockoutGap(unit.toDoc(v))}
        />
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Hide what is inside the top shape too</span>
        <Switch checked={!outlineOnly} onCheckedChange={(v) => setKnockoutOutlineOnly(!v)} aria-label="Hide what is inside the top shape too" />
      </label>
      {iconDoc && <span className="text-xs text-muted-foreground">T is the tile size: 0.03 T is about 4 units on a 128 tile.</span>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cancelKnockout}>
          Cancel
        </Button>
        <Button size="sm" onClick={commitKnockout}>
          Apply
        </Button>
      </div>
    </div>
  );
}
