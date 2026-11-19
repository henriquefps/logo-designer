import { SCREEN_PLATFORMS, type ScreenPlatform } from '@/model';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useScreenToolPrefs } from '@/wireframe/toolPrefs';

/** Options bar of the Screen tool: which platform the next click places. */
export function ScreenToolOptions() {
  const platform = useScreenToolPrefs((s) => s.platform);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={platform}
        onValueChange={(v) => v && useScreenToolPrefs.getState().setPlatform(v as ScreenPlatform)}
        aria-label="Platform"
      >
        {SCREEN_PLATFORMS.map((p) => (
          <ToggleGroupItem key={p.id} value={p.id} className="px-3">
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="truncate text-sm text-muted-foreground">Click on the canvas to place a screen.</span>
    </div>
  );
}
