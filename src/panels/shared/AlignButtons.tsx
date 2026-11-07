import {
  AlignBottomIcon,
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  ColumnsIcon,
  RowsIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { alignDeltas, distributeDeltas, type AlignMode, type DistributeMode, type Id } from '@/model';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { translateNodes } from '@/actions/selection';
import { useDocStore } from '@/store/useDocStore';
import { cn } from '@/lib/utils';

const ALIGN: { mode: AlignMode; label: string; icon: typeof AlignLeftIcon }[] = [
  { mode: 'left', label: 'Align left', icon: AlignLeftIcon },
  { mode: 'hcenter', label: 'Align horizontal centers', icon: AlignCenterHorizontalIcon },
  { mode: 'right', label: 'Align right', icon: AlignRightIcon },
  { mode: 'top', label: 'Align top', icon: AlignTopIcon },
  { mode: 'vcenter', label: 'Align vertical centers', icon: AlignCenterVerticalIcon },
  { mode: 'bottom', label: 'Align bottom', icon: AlignBottomIcon },
];
const DIST: { mode: DistributeMode; label: string; icon: typeof AlignLeftIcon }[] = [
  { mode: 'horizontal', label: 'Distribute horizontally', icon: ColumnsIcon },
  { mode: 'vertical', label: 'Distribute vertically', icon: RowsIcon },
];

function IconAction({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof AlignLeftIcon; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Align / distribute to the selection or the artboard (single selections always use the artboard). */
export function AlignButtons({ ids, compact = false }: { ids: Id[]; compact?: boolean }) {
  const [target, setTarget] = useState<'selection' | 'artboard'>('selection');
  const toArtboard = target === 'artboard' || ids.length < 2;
  const doc = () => useDocStore.getState().doc;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', compact && 'flex-nowrap')}>
      {ALIGN.map((a) => (
        <IconAction key={a.mode} label={a.label} icon={a.icon} onClick={() => translateNodes(alignDeltas(doc(), ids, a.mode, toArtboard), a.label)} />
      ))}
      {DIST.map((d) => (
        <IconAction
          key={d.mode}
          label={d.label}
          icon={d.icon}
          disabled={ids.length < (toArtboard ? 2 : 3)}
          onClick={() => translateNodes(distributeDeltas(doc(), ids, d.mode, toArtboard), d.label)}
        />
      ))}
      <Select value={ids.length < 2 ? 'artboard' : target} onValueChange={(v) => setTarget(v as typeof target)} disabled={ids.length < 2}>
        <SelectTrigger size="sm" className={cn('ml-auto', compact ? 'w-44' : 'w-full mt-1')} aria-label="Align to">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="selection">Align to selection</SelectItem>
          <SelectItem value="artboard">Align to artboard</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
