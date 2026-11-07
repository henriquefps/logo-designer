import { ArrowArcLeftIcon, ArrowArcRightIcon, ListIcon, SlidersHorizontalIcon, FolderOpenIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CanvasView } from '@/canvas/CanvasView';
import { ThemeMenu } from '@/theme/ThemeMenu';
import { runAction } from '@/actions/registry';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { MenuDropdownItems } from './MenuBar';
import { PanelTabs } from './PanelTabs';
import { ProjectTitle } from './ProjectTitle';
import { ToolBar } from './ToolBar';

/** Phones: full-screen canvas, compact top bar, bottom tool strip, panels in a bottom Sheet. */
export function MobileLayout() {
  const open = useEditorStore((s) => s.mobilePanelOpen);
  const setOpen = useEditorStore((s) => s.setMobilePanelOpen);
  const canUndo = useDocStore((s) => s.past.length > 0);
  const canRedo = useDocStore((s) => s.future.length > 0);
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-13 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu">
              <ListIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            <DropdownMenuItem onSelect={() => useEditorStore.getState().openDialog('projects')}>
              <FolderOpenIcon />
              Projects…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <MenuDropdownItems />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="min-w-0 flex-1">
          <ProjectTitle />
        </div>
        <Button variant="ghost" size="icon" aria-label="Undo" disabled={!canUndo} onClick={() => runAction('edit.undo')}>
          <ArrowArcLeftIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Redo" disabled={!canRedo} onClick={() => runAction('edit.redo')}>
          <ArrowArcRightIcon />
        </Button>
        <ThemeMenu />
        <Button variant="ghost" size="icon" aria-label="Panels" onClick={() => setOpen(true)}>
          <SlidersHorizontalIcon />
        </Button>
      </header>
      <main className="relative min-h-0 flex-1 overflow-hidden border-y">
        <CanvasView />
      </main>
      <nav className="shrink-0 bg-background py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        <ToolBar orientation="horizontal" />
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-xl p-0 data-[side=bottom]:h-[70dvh]" showCloseButton={false}>
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="sr-only">
            <SheetTitle>Panels</SheetTitle>
            <SheetDescription>Properties, layers and assets</SheetDescription>
          </SheetHeader>
          <PanelTabs />
        </SheetContent>
      </Sheet>
    </div>
  );
}
