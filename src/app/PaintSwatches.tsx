import { useState } from 'react';
import { ArrowsCounterClockwiseIcon } from '@phosphor-icons/react';
import type { Paint } from '@/model';
import { cn } from '@/lib/utils';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { PaintEditor } from '@/panels/shared/PaintEditor';
import { NumberField } from '@/panels/shared/NumberField';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { applyPaint, resetPaint, selectedPaintedNodes, swapPaint, usePaintDefaults } from '@/store/usePaintDefaults';

const checker = 'repeating-conic-gradient(var(--muted) 0% 25%, var(--card) 0% 50%)';

function paintCss(p: Paint): string {
  if (p.kind === 'none') return 'none';
  if (p.kind === 'solid') return `linear-gradient(${p.color}, ${p.color})`;
  const stops = [...p.stops].sort((a, b) => a.offset - b.offset).map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  return p.kind === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${(p.angle ?? 0) + 90}deg, ${stops})`;
}

/** Fill/stroke shown in the swatches: the first selected painted object, else the current defaults. */
function useCurrentPaint() {
  useDocStore((s) => s.doc);
  useEditorStore((s) => s.selection);
  const defaults = usePaintDefaults();
  const sel = selectedPaintedNodes()[0];
  return sel
    ? { fill: sel.fill, stroke: sel.stroke.paint, strokeWidth: sel.stroke.width, fromSelection: true }
    : { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: defaults.strokeWidth, fromSelection: false };
}

/** "None" swatch: white with a red diagonal, like Illustrator. */
const NONE_BG = 'linear-gradient(to top right, transparent calc(50% - 1px), var(--destructive) calc(50% - 1px), var(--destructive) calc(50% + 1px), transparent calc(50% + 1px))';

function Swatch({ paint, kind, front, onClick }: { paint: Paint; kind: 'fill' | 'stroke'; front: boolean; onClick: () => void }) {
  const bg = paint.kind === 'none' ? `${NONE_BG}, linear-gradient(var(--card), var(--card))` : `${paintCss(paint)}, ${checker}`;
  return (
    <button
      type="button"
      aria-label={kind === 'fill' ? 'Current fill' : 'Current stroke'}
      onClick={onClick}
      className={cn(
        'absolute size-6 rounded-[5px] border border-foreground/40 shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        kind === 'fill' ? 'top-0 left-0' : 'right-0 bottom-0',
        front ? 'z-10' : 'z-0',
      )}
      style={{ backgroundImage: bg, backgroundSize: paint.kind === 'none' ? 'auto' : 'auto, 8px 8px' }}
    >
      {kind === 'stroke' && <span aria-hidden="true" className="absolute inset-[5px] rounded-[2px] border border-foreground/40 bg-card" />}
    </button>
  );
}

/**
 * Illustrator-style fill and stroke swatches (bottom of the tool bar): overlapping squares, click
 * one to edit it in a popover, X swaps, D resets. Edits apply to the selection and become the
 * paint for new objects.
 */
export function PaintSwatches({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const cur = useCurrentPaint();
  const active = usePaintDefaults((s) => s.active);
  const [open, setOpen] = useState<null | 'fill' | 'stroke'>(null);

  const openFor = (k: 'fill' | 'stroke') => {
    usePaintDefaults.getState().set({ active: k });
    setOpen((o) => (o === k ? null : k));
  };

  return (
    <Popover open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
      <PopoverAnchor asChild>
        <div className={cn('flex shrink-0 items-center gap-1', orientation === 'vertical' ? 'flex-col py-2' : 'flex-row px-1')}>
          <div className="relative size-10" role="group" aria-label="Fill and stroke">
            <Swatch paint={cur.fill} kind="fill" front={active === 'fill'} onClick={() => openFor('fill')} />
            <Swatch paint={cur.stroke} kind="stroke" front={active === 'stroke'} onClick={() => openFor('stroke')} />
          </div>
          <div className={cn('flex gap-0.5', orientation === 'vertical' ? 'flex-row' : 'flex-col')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Swap fill and stroke"
                  onClick={swapPaint}
                  className="flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"
                >
                  <ArrowsCounterClockwiseIcon />
                </button>
              </TooltipTrigger>
              <TooltipContent side={orientation === 'vertical' ? 'right' : 'top'} className="flex items-center gap-2">
                Swap fill and stroke <Kbd>X</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Default fill and stroke"
                  onClick={resetPaint}
                  className="relative flex size-5 items-center justify-center rounded-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span aria-hidden="true" className="absolute top-[3px] left-[3px] size-2.5 rounded-[2px] border border-foreground/50 bg-primary" />
                  <span aria-hidden="true" className="absolute right-[3px] bottom-[3px] size-2.5 rounded-[2px] border border-foreground/50 bg-card" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={orientation === 'vertical' ? 'right' : 'top'} className="flex items-center gap-2">
                Default fill and stroke <Kbd>D</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        side={orientation === 'vertical' ? 'right' : 'top'}
        align="end"
        className="w-72 gap-3 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {open && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{open === 'fill' ? 'Fill' : 'Stroke'}</span>
              <span className="text-xs text-muted-foreground">{cur.fromSelection ? 'Selection and new objects' : 'New objects'}</span>
            </div>
            <PaintEditor
              inline
              label={open === 'fill' ? 'Fill' : 'Stroke'}
              value={open === 'fill' ? cur.fill : cur.stroke}
              onChange={(p) => applyPaint(open === 'fill' ? { fill: p } : { stroke: p }, open === 'fill' ? 'Fill' : 'Stroke')}
            />
            {open === 'stroke' && cur.stroke.kind !== 'none' && (
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
                <span className="text-sm text-muted-foreground">Width</span>
                <NumberField ariaLabel="Stroke width" value={cur.strokeWidth} min={0} suffix="px" undoLabel="Stroke width" onCommit={(w) => applyPaint({ strokeWidth: w }, 'Stroke width')} />
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
