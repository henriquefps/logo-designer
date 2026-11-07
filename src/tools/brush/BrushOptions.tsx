import { OptionNumber, OptionSlider } from '@/vector/OptionControls';
import { useBrush } from './state';

export function BrushOptions() {
  const size = useBrush((s) => s.size);
  const thinning = useBrush((s) => s.thinning);
  return (
    <div className="flex min-w-0 items-center gap-4">
      <OptionNumber label="Size" value={size} min={1} max={500} onChange={(v) => useBrush.setState({ size: v })} />
      <OptionSlider
        label="Thinning"
        value={Math.round(thinning * 100)}
        min={0}
        max={100}
        format={(v) => `${v}%`}
        onChange={(v) => useBrush.setState({ thinning: v / 100 })}
      />
    </div>
  );
}
