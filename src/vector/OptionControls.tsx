import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { NumberField } from '@/panels/shared/NumberField';

/** Label + slider + value, sized for the options bar. */
export function OptionSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Slider className="w-28" aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
      <span className="w-10 text-right tabular-nums">{format(value)}</span>
    </label>
  );
}

/** Label + compact number input for the options bar. */
export function OptionNumber({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <NumberField className="w-20" ariaLabel={label} value={value} min={min} max={max} step={step} precision={0} onCommit={onChange} />
    </div>
  );
}

export function OptionSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} aria-label={label} />
      <span>{label}</span>
    </label>
  );
}
