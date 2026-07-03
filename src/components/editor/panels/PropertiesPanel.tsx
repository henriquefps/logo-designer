import { FlipHorizontalIcon, FlipVerticalIcon } from '@phosphor-icons/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useActiveProject, useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { ColorField } from '@/components/editor/shared/ColorField';
import { NumberField } from '@/components/editor/shared/NumberField';
import { AlignmentPad } from './AlignmentPad';
import { FONT_OPTIONS, findFont } from '@/lib/fonts';
import type { IconElement, LogoElement, TextElement } from '@/types/element';

const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const;

function hasColor(el: LogoElement): el is IconElement | TextElement {
  return el.type === 'icon' || el.type === 'text';
}

function hasSize(el: LogoElement): el is Exclude<LogoElement, { type: 'shape' }> {
  return el.type !== 'shape';
}

export function PropertiesPanel() {
  const project = useActiveProject();
  const selectedIds = useUIStore((s) => s.selectedIds);

  const selectedSet = new Set(selectedIds);
  const selected = project ? project.elements.filter((el) => selectedSet.has(el.id)) : [];

  // selectedIds can briefly reference an id that was just deleted (the store update that
  // clears selection and the one that removes the element aren't guaranteed to land in the
  // same render), so guard on the *resolved* selection, not the raw id list.
  if (!project || selected.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Select an element on the canvas to edit its properties.</p>;
  }

  const single = selected.length === 1 ? selected[0] : null;
  const sizedSelected = selected.filter(hasSize);

  const update = (patch: Partial<LogoElement>) => {
    const store = useProjectStore.getState();
    store.beginGesture();
    store.updateElements(selectedIds, patch);
  };
  const commit = () => useProjectStore.getState().commit();

  const updateSingle = (patch: Partial<LogoElement>) => {
    if (!single) return;
    const store = useProjectStore.getState();
    store.beginGesture();
    store.updateElement(single.id, patch);
  };

  return (
    <div className="space-y-6 p-4">
      <AlignmentPad />
      <Separator />

      {single?.type === 'text' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Text</Label>
          <Textarea
            value={single.text}
            rows={2}
            onChange={(e) => updateSingle({ text: e.target.value })}
            onBlur={commit}
            className="resize-none text-sm"
          />
        </div>
      )}

      {single?.type === 'text' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Font</Label>
            <Select
              value={single.fontFamily}
              onValueChange={(fontFamily) => {
                const font = findFont(fontFamily);
                updateSingle({ fontFamily, fontWeight: font.defaultWeight });
                commit();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((font) => (
                  <SelectItem key={font.family} value={font.family} style={{ fontFamily: font.family }}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Weight</Label>
            <Select
              value={single.fontWeight}
              onValueChange={(fontWeight) => {
                updateSingle({ fontWeight });
                commit();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {findFont(single.fontFamily).weights.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {(() => {
        const colorable = selected.filter(hasColor);
        if (colorable.length === 0) return null;
        const value = single && hasColor(single) ? single.color : colorable[0].color;
        return <ColorField label="Color" value={value} onChange={(color) => update({ color })} onCommit={commit} />;
      })()}

      {single?.type === 'icon' && single.iconType === 'phosphor' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Weight</Label>
          <Select
            value={single.weight ?? 'regular'}
            onValueChange={(weight: (typeof WEIGHTS)[number]) => {
              updateSingle({ weight });
              commit();
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEIGHTS.map((w) => (
                <SelectItem key={w} value={w} className="capitalize">
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {single?.type === 'icon' && single.iconType === 'lucide' && (
        <NumberField
          label="Stroke width"
          value={single.strokeWidth ?? 2}
          min={0.5}
          max={4}
          step={0.1}
          onChange={(strokeWidth) => updateSingle({ strokeWidth })}
          onCommit={commit}
        />
      )}

      {single?.type === 'shape' && (
        <div className="space-y-6">
          {single.shape !== 'line' && single.shape !== 'path' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Filled</Label>
                <Switch
                  checked={single.fill !== null}
                  onCheckedChange={(checked) => {
                    updateSingle({ fill: checked ? single.stroke : null, strokeWidth: checked ? single.strokeWidth : single.strokeWidth || 2 });
                    commit();
                  }}
                />
              </div>
              {single.fill !== null && <ColorField label="Fill" value={single.fill} onChange={(fill) => updateSingle({ fill })} onCommit={commit} />}
            </div>
          )}

          <ColorField label="Stroke" value={single.stroke} onChange={(stroke) => updateSingle({ stroke })} onCommit={commit} />
          <NumberField label="Stroke width" value={single.strokeWidth} min={0} max={40} onChange={(strokeWidth) => updateSingle({ strokeWidth })} onCommit={commit} />

          {single.shape === 'rectangle' && (
            <NumberField label="Corner radius" value={single.cornerRadius ?? 0} min={0} max={200} onChange={(cornerRadius) => updateSingle({ cornerRadius })} onCommit={commit} />
          )}

          {(single.shape === 'rectangle' || single.shape === 'ellipse') && (
            <>
              <NumberField label="Width" value={single.width} min={4} max={480} onChange={(width) => updateSingle({ width })} onCommit={commit} />
              <NumberField label="Height" value={single.height} min={4} max={480} onChange={(height) => updateSingle({ height })} onCommit={commit} />
            </>
          )}
        </div>
      )}

      {sizedSelected.length > 0 && (
        <NumberField
          label="Size"
          value={single && hasSize(single) ? single.size : sizedSelected[0].size}
          min={10}
          max={480}
          onChange={(size) => update({ size })}
          onCommit={commit}
        />
      )}

      <NumberField label="Rotation" value={single?.rotation ?? selected[0].rotation} min={0} max={360} unit="°" onChange={(rotation) => update({ rotation })} onCommit={commit} />
      <NumberField label="Opacity" value={single?.opacity ?? selected[0].opacity} min={0} max={100} unit="%" onChange={(opacity) => update({ opacity })} onCommit={commit} />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Flip</Label>
        <div className="flex gap-2">
          <Toggle
            pressed={single?.flipH ?? selected[0].flipH}
            onPressedChange={(flipH) => {
              update({ flipH });
              commit();
            }}
            aria-label="Flip horizontal"
          >
            <FlipHorizontalIcon className="size-4" />
          </Toggle>
          <Toggle
            pressed={single?.flipV ?? selected[0].flipV}
            onPressedChange={(flipV) => {
              update({ flipV });
              commit();
            }}
            aria-label="Flip vertical"
          >
            <FlipVerticalIcon className="size-4" />
          </Toggle>
        </div>
      </div>

      {single && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">X</Label>
            <Input
              type="number"
              value={Math.round(single.x)}
              onChange={(e) => updateSingle({ x: Number(e.target.value) })}
              onBlur={commit}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Y</Label>
            <Input
              type="number"
              value={Math.round(single.y)}
              onChange={(e) => updateSingle({ y: Number(e.target.value) })}
              onBlur={commit}
              className="h-8"
            />
          </div>
        </div>
      )}
    </div>
  );
}
