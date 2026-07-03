import { ArrowCounterClockwiseIcon, ArrowClockwiseIcon, MinusIcon, PlusIcon, FrameCornersIcon, PaletteIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { ProjectSwitcher } from './ProjectSwitcher';
import { ThemeToggle } from './ThemeToggle';

export function Toolbar() {
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.canUndo());
  const canRedo = useProjectStore((s) => s.canRedo());

  const zoom = useUIStore((s) => s.zoom);
  const setZoom = useUIStore((s) => s.setZoom);
  const resetView = useUIStore((s) => s.resetView);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <PaletteIcon className="size-5 text-primary" weight="fill" />
      <span className="hidden font-heading text-sm font-bold tracking-tight sm:inline">LogoGo</span>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ProjectSwitcher />

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={undo} disabled={!canUndo}>
              <ArrowCounterClockwiseIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl/Cmd+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={redo} disabled={!canRedo}>
              <ArrowClockwiseIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl/Cmd+Shift+Z)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => z - 0.1)}>
          <MinusIcon className="size-4" />
        </Button>
        <button type="button" onClick={resetView} className="w-12 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground">
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => z + 0.1)}>
          <PlusIcon className="size-4" />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={resetView}>
              <FrameCornersIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit to screen</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />
        <ThemeToggle />
      </div>
    </header>
  );
}
