import { OptionNumber, OptionSlider, OptionSwitch } from '@/vector/OptionControls';
import { usePolygonOptions } from './state';

export function PolygonOptions() {
  const { sides, star, innerRatio } = usePolygonOptions();
  return (
    <div className="flex min-w-0 items-center gap-4">
      <OptionNumber label={star ? 'Points' : 'Sides'} value={sides} min={3} max={64} onChange={(v) => usePolygonOptions.setState({ sides: Math.round(v) })} />
      <OptionSwitch label="Star" checked={star} onChange={(v) => usePolygonOptions.setState({ star: v })} />
      {star && (
        <OptionSlider
          label="Inner radius"
          value={Math.round(innerRatio * 100)}
          min={5}
          max={95}
          format={(v) => `${v}%`}
          onChange={(v) => usePolygonOptions.setState({ innerRatio: v / 100 })}
        />
      )}
    </div>
  );
}
