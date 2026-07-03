import {
  ShapesIcon,
  TextTIcon,
  ImageIcon as ImageTypeIcon,
  SquareIcon,
  CircleIcon,
  LineSegmentIcon,
  PencilSimpleIcon,
  CopySimpleIcon,
  TrashIcon,
  LockIcon,
  LockOpenIcon,
  ArrowLineUpIcon,
  ArrowLineDownIcon,
  CaretUpIcon,
  CaretDownIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useActiveProject, useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import type { LogoElement } from '@/types/element';

const SHAPE_LABELS = { rectangle: 'Rectangle', ellipse: 'Ellipse', line: 'Line', path: 'Path' } as const;

function layerLabel(el: LogoElement): string {
  if (el.type === 'text') return el.text || 'Text';
  if (el.type === 'icon') return el.name;
  if (el.type === 'shape') return SHAPE_LABELS[el.shape];
  return el.label ?? 'Image';
}

function LayerIcon({ element }: { element: LogoElement }) {
  if (element.type === 'text') return <TextTIcon className="size-4" />;
  if (element.type === 'image') return <ImageTypeIcon className="size-4" />;
  if (element.type === 'shape') {
    if (element.shape === 'rectangle') return <SquareIcon className="size-4" />;
    if (element.shape === 'ellipse') return <CircleIcon className="size-4" />;
    if (element.shape === 'line') return <LineSegmentIcon className="size-4" />;
    return <PencilSimpleIcon className="size-4" />;
  }
  return <ShapesIcon className="size-4" />;
}

export function LayersPanel() {
  const project = useActiveProject();
  const selectedIds = useUIStore((s) => s.selectedIds);
  const setSelection = useUIStore((s) => s.setSelection);
  const toggleSelection = useUIStore((s) => s.toggleSelection);

  if (!project) return null;

  // Render front-most (last in array, drawn on top) first, matching how design tools list layers.
  const layers = [...project.elements].reverse();

  if (layers.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No elements yet. Add an icon, text, or image from the Add tab.</p>;
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {layers.map((el) => {
        const isSelected = selectedIds.includes(el.id);
        return (
          <div
            key={el.id}
            onClick={(e) => (e.shiftKey ? toggleSelection(el.id) : setSelection([el.id]))}
            className={cn(
              'group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors',
              isSelected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/50',
            )}
          >
            <LayerIcon element={el} />
            <span className="flex-1 truncate">{layerLabel(el)}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                title={el.locked ? 'Unlock' : 'Lock'}
                onClick={(e) => {
                  e.stopPropagation();
                  useProjectStore.getState().beginGesture();
                  useProjectStore.getState().updateElement(el.id, { locked: !el.locked });
                  useProjectStore.getState().commit();
                }}
              >
                {el.locked ? <LockIcon className="size-3.5" /> : <LockOpenIcon className="size-3.5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                title="Move backward"
                onClick={(e) => {
                  e.stopPropagation();
                  useProjectStore.getState().reorderElement(el.id, 'down');
                }}
              >
                <CaretDownIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                title="Move forward"
                onClick={(e) => {
                  e.stopPropagation();
                  useProjectStore.getState().reorderElement(el.id, 'up');
                }}
              >
                <CaretUpIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                title="Bring to front"
                onClick={(e) => {
                  e.stopPropagation();
                  useProjectStore.getState().reorderElement(el.id, 'front');
                }}
              >
                <ArrowLineUpIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                title="Send to back"
                onClick={(e) => {
                  e.stopPropagation();
                  useProjectStore.getState().reorderElement(el.id, 'back');
                }}
              >
                <ArrowLineDownIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                title="Duplicate"
                onClick={(e) => {
                  e.stopPropagation();
                  const newIds = useProjectStore.getState().duplicateElements([el.id]);
                  setSelection(newIds);
                }}
              >
                <CopySimpleIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-destructive hover:text-destructive"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  useProjectStore.getState().removeElements([el.id]);
                  setSelection(selectedIds.filter((id) => id !== el.id));
                }}
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
