import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  onCommit: () => void;
}

export function NumberField({ label, value, min, max, step = 1, unit = '', onChange, onCommit }: NumberFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} onValueCommit={onCommit} />
    </div>
  );
}
