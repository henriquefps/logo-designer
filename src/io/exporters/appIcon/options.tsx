import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useChoice, type Choice } from './choice';


export function AppIconOptions() {
  const { choice, set } = useChoice();
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
      <Label className="text-sm font-normal text-muted-foreground">Output</Label>
      <div className="flex min-w-0 flex-col gap-1.5">
        <ToggleGroup type="single" variant="outline" value={choice} onValueChange={(v) => v && set(v as Choice)} aria-label="App icon output">
          <ToggleGroupItem value="zip" className="px-3">
            Icon set (ZIP)
          </ToggleGroupItem>
          <ToggleGroupItem value="glyph" className="px-3">
            Glyph SVG
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-sm text-muted-foreground">
          {choice === 'zip' ? 'docs-img, site, Android, iOS, review sheet and the project file.' : '128 fragment in currentColor for build-icons.mjs.'}
        </span>
      </div>
    </div>
  );
}
