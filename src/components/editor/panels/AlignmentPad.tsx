import {
  ArrowUpLeftIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  ArrowLeftIcon,
  CircleIcon,
  ArrowRightIcon,
  ArrowDownLeftIcon,
  ArrowDownIcon,
  ArrowDownRightIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useActiveProject, useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { getElementSize } from '@/lib/elementBounds';
import { alignBoth, type AlignAxisMode } from '@/lib/alignment';

const CELLS: { x: AlignAxisMode; y: AlignAxisMode; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { x: 'start', y: 'start', icon: ArrowUpLeftIcon, label: 'Top left' },
  { x: 'center', y: 'start', icon: ArrowUpIcon, label: 'Top' },
  { x: 'end', y: 'start', icon: ArrowUpRightIcon, label: 'Top right' },
  { x: 'start', y: 'center', icon: ArrowLeftIcon, label: 'Left' },
  { x: 'center', y: 'center', icon: CircleIcon, label: 'Center' },
  { x: 'end', y: 'center', icon: ArrowRightIcon, label: 'Right' },
  { x: 'start', y: 'end', icon: ArrowDownLeftIcon, label: 'Bottom left' },
  { x: 'center', y: 'end', icon: ArrowDownIcon, label: 'Bottom' },
  { x: 'end', y: 'end', icon: ArrowDownRightIcon, label: 'Bottom right' },
];

/**
 * With one element selected, aligns it to the canvas. With 2+, aligns them
 * to their combined bounding box (align-to-selection), matching standard
 * design-tool behavior.
 */
export function AlignmentPad() {
  const project = useActiveProject();
  const selectedIds = useUIStore((s) => s.selectedIds);
  const textSizes = useUIStore((s) => s.textSizes);

  if (!project || selectedIds.length === 0) return null;

  const handleAlign = (xMode: AlignAxisMode, yMode: AlignAxisMode) => {
    const selectedSet = new Set(selectedIds);
    const targets = project.elements
      .filter((el) => selectedSet.has(el.id))
      .map((el) => {
        const size = getElementSize(el, textSizes[el.id]);
        return { id: el.id, x: el.x, y: el.y, width: size.width, height: size.height };
      });
    const positions = alignBoth(targets, xMode, yMode);
    const store = useProjectStore.getState();
    store.beginGesture();
    store.setElementPositions(positions);
    store.commit();
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{selectedIds.length > 1 ? 'Align selection' : 'Align to canvas'}</Label>
      <div className="grid w-fit grid-cols-3 gap-1">
        {CELLS.map(({ x, y, icon: Icon, label }) => (
          <Button key={label} type="button" variant="outline" size="icon" className="size-8" title={label} onClick={() => handleAlign(x, y)}>
            <Icon className="size-3.5" />
          </Button>
        ))}
      </div>
    </div>
  );
}
