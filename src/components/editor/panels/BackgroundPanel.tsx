import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useActiveProject, useProjectStore } from '@/store/useProjectStore';
import { ColorField } from '@/components/editor/shared/ColorField';
import { NumberField } from '@/components/editor/shared/NumberField';
import type { BackgroundShape, BackgroundType, CanvasSettings } from '@/types/canvas';

const SHAPES: { value: BackgroundShape; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'squircle', label: 'Squircle' },
  { value: 'circle', label: 'Circle' },
];

export function BackgroundPanel() {
  const project = useActiveProject();
  if (!project) return null;
  const { canvasSettings } = project;

  const update = (patch: Partial<CanvasSettings>) => {
    const store = useProjectStore.getState();
    store.beginGesture();
    store.setCanvasSettings(patch);
  };
  const commit = () => useProjectStore.getState().commit();

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Fill</Label>
        <Select
          value={canvasSettings.bgType}
          onValueChange={(value: BackgroundType) => {
            update({ bgType: value });
            commit();
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="gradient">Gradient</SelectItem>
            <SelectItem value="transparent">Transparent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Shape</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          value={canvasSettings.bgShape}
          onValueChange={(value: BackgroundShape) => {
            if (!value) return;
            update({ bgShape: value });
            commit();
          }}
          className="grid grid-cols-4"
        >
          {SHAPES.map((shape) => (
            <ToggleGroupItem key={shape.value} value={shape.value} className="text-xs">
              {shape.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {canvasSettings.bgType === 'solid' && (
        <ColorField label="Color" value={canvasSettings.bgColor} onChange={(bgColor) => update({ bgColor })} onCommit={commit} />
      )}

      {canvasSettings.bgType === 'gradient' && (
        <div className="space-y-4">
          <ColorField label="Start" value={canvasSettings.bgGradientStart} onChange={(bgGradientStart) => update({ bgGradientStart })} onCommit={commit} showPalette={false} />
          <ColorField label="End" value={canvasSettings.bgGradientEnd} onChange={(bgGradientEnd) => update({ bgGradientEnd })} onCommit={commit} showPalette={false} />
          <NumberField
            label="Angle"
            value={canvasSettings.bgGradientAngle}
            min={0}
            max={360}
            unit="°"
            onChange={(bgGradientAngle) => update({ bgGradientAngle })}
            onCommit={commit}
          />
        </div>
      )}

      {canvasSettings.bgType === 'transparent' && (
        <p className="text-xs text-muted-foreground">Exported PNG/WebP will keep a transparent background.</p>
      )}
    </div>
  );
}
