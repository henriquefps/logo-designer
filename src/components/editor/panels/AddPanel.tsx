import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { UploadSimpleIcon, SquareIcon, CircleIcon, LineSegmentIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore, type DrawTool } from '@/store/useUIStore';
import { createId } from '@/lib/id';
import { compressImageFile } from '@/lib/image';
import type { ImageElement, TextElement } from '@/types/element';
import { IconPicker } from './IconPicker/IconPicker';

const SHAPE_TOOLS: { value: Exclude<DrawTool, 'select'>; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'rectangle', label: 'Rectangle', icon: SquareIcon },
  { value: 'ellipse', label: 'Ellipse', icon: CircleIcon },
  { value: 'line', label: 'Line', icon: LineSegmentIcon },
  { value: 'pen', label: 'Pen', icon: PencilSimpleIcon },
];

function ShapeToolPicker() {
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);

  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        value={activeTool === 'select' ? '' : activeTool}
        onValueChange={(v: DrawTool | '') => setActiveTool(v === '' ? 'select' : (v as DrawTool))}
        className="grid grid-cols-4"
      >
        {SHAPE_TOOLS.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value} title={label} aria-label={label}>
            <Icon className="size-4" />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {activeTool !== 'select' && (
        <p className="text-xs text-muted-foreground">
          Click for a default size, or drag on the canvas to set one. <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Esc</kbd> to cancel.
        </p>
      )}
    </div>
  );
}

export function AddPanel() {
  const [textInput, setTextInput] = useState('Text');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setSelection = useUIStore((s) => s.setSelection);

  const addText = () => {
    if (!textInput.trim()) return;
    const element: TextElement = {
      id: createId(),
      type: 'text',
      text: textInput,
      x: 256,
      y: 256,
      size: 32,
      color: '#211f1a',
      fontFamily: 'Inter Variable',
      fontWeight: '700',
      rotation: 0,
      opacity: 100,
      flipH: false,
      flipV: false,
      locked: false,
    };
    useProjectStore.getState().addElement(element);
    setSelection([element.id]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { dataUrl, width, height } = await compressImageFile(file);
      const size = Math.min(220, Math.max(width, height));
      const element: ImageElement = {
        id: createId(),
        type: 'image',
        src: dataUrl,
        label: file.name,
        x: 256,
        y: 256,
        size,
        naturalWidth: width,
        naturalHeight: height,
        rotation: 0,
        opacity: 100,
        flipH: false,
        flipV: false,
        locked: false,
      };
      useProjectStore.getState().addElement(element);
      setSelection([element.id]);
    } catch {
      toast.error('Could not add that image', { description: 'Try a different file (PNG, JPG, WebP, or GIF).' });
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Icon</Label>
        <IconPicker />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Shapes</Label>
        <ShapeToolPicker />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Text</Label>
        <div className="flex gap-2">
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addText()}
            placeholder="Enter your text"
            className="h-9"
          />
          <Button type="button" onClick={addText}>
            Add
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Image</Label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-input p-6 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <UploadSimpleIcon className="size-6" />
          <span className="text-xs font-medium">Upload image</span>
          <span className="text-[10px] text-muted-foreground">Large images are automatically resized</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      </div>
    </div>
  );
}
