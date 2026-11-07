import { OptionSlider } from '@/vector/OptionControls';
import { usePencil } from './state';

export function PencilOptions() {
  const smoothness = usePencil((s) => s.smoothness);
  return (
    <div className="flex min-w-0 items-center gap-4">
      <OptionSlider label="Smoothness" value={smoothness} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => usePencil.setState({ smoothness: v })} />
      <span className="hidden truncate text-sm text-muted-foreground lg:inline">Draw freehand; release near the start to close.</span>
    </div>
  );
}
