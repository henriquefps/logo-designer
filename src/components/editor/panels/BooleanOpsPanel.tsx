import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { isBooleanOpEligible, type BooleanOpKind } from '@/lib/booleanOps';
import type { LogoElement } from '@/types/element';

const OPS: { op: BooleanOpKind; label: string; title: string }[] = [
  { op: 'unite', label: 'Union', title: 'Combine into one shape' },
  { op: 'subtract', label: 'Subtract', title: 'Cut the back shapes out of the front one' },
  { op: 'intersect', label: 'Intersect', title: 'Keep only the overlapping area' },
  { op: 'exclude', label: 'Exclude', title: 'Keep only the non-overlapping area' },
];

interface BooleanOpsPanelProps {
  selected: LogoElement[];
}

/** Only shown for 2+ selected elements that are all closed, area-having shapes (rectangle,
 * ellipse, or path) — icons and text need "convert to path" first, and 'line' has no fill
 * region, so none of those are valid boolean-op input yet. */
export function BooleanOpsPanel({ selected }: BooleanOpsPanelProps) {
  const setSelection = useUIStore((s) => s.setSelection);

  if (selected.length < 2 || !selected.every(isBooleanOpEligible)) return null;

  const handleOp = async (op: BooleanOpKind) => {
    const newId = await useProjectStore.getState().applyBooleanOp(
      selected.map((el) => el.id),
      op,
    );
    if (newId) setSelection([newId]);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Boolean</Label>
      <div className="grid grid-cols-2 gap-1.5">
        {OPS.map(({ op, label, title }) => (
          <Button key={op} type="button" variant="outline" size="xs" title={title} onClick={() => handleOp(op)}>
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
