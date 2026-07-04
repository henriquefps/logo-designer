import { useState } from 'react';
import {
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  MinusIcon,
  PlusIcon,
  FrameCornersIcon,
  PaletteIcon,
  DotsThreeVerticalIcon,
  KeyboardIcon,
  InfoIcon,
  SunIcon,
  MoonIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { ProjectSwitcher } from './ProjectSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { AboutDialog } from './AboutDialog';
import { ShortcutsDialog } from './ShortcutsDialog';

export function Toolbar() {
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.canUndo());
  const canRedo = useProjectStore((s) => s.canRedo());

  const zoom = useUIStore((s) => s.zoom);
  const setZoom = useUIStore((s) => s.setZoom);
  const resetView = useUIStore((s) => s.resetView);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const [mobileShortcutsOpen, setMobileShortcutsOpen] = useState(false);
  const [mobileAboutOpen, setMobileAboutOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <PaletteIcon className="size-5 text-primary" weight="fill" />
      <h1 className="sr-only">
        LogoGo — free logo and app icon designer. Design with Lucide and Phosphor icons, custom shapes, text, and
        backgrounds, no login required, then export as SVG, PNG, WebP, or a full icon pack for iOS, Android, and Web.
      </h1>
      <span aria-hidden="true" className="hidden font-heading text-sm font-bold tracking-tight sm:inline">LogoGo</span>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={resetView}>
              <FrameCornersIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit to screen</TooltipContent>
        </Tooltip>

        {/* Desktop: granular zoom controls + shortcuts/about/theme stay inline. */}
        <div className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => z - 0.1)}>
            <MinusIcon className="size-4" />
          </Button>
          <button type="button" onClick={resetView} className="w-12 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => z + 0.1)}>
            <PlusIcon className="size-4" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />
          <ShortcutsDialog />
          <AboutDialog />
          <ThemeToggle />
        </div>

        {/* Mobile: the same secondary actions collapse into one overflow menu. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 md:hidden">
              <DotsThreeVerticalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setZoom((z) => z + 0.1)}>
              <PlusIcon className="size-3.5" /> Zoom in
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setZoom((z) => z - 0.1)}>
              <MinusIcon className="size-3.5" /> Zoom out
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setMobileShortcutsOpen(true)}>
              <KeyboardIcon className="size-3.5" /> Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMobileAboutOpen(true)}>
              <InfoIcon className="size-3.5" /> About & privacy
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />}
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ShortcutsDialog open={mobileShortcutsOpen} onOpenChange={setMobileShortcutsOpen} hideTrigger />
      <AboutDialog open={mobileAboutOpen} onOpenChange={setMobileAboutOpen} hideTrigger />
    </header>
  );
}
