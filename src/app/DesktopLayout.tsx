import { CanvasView } from '@/canvas/CanvasView';
import { ThemeMenu } from '@/theme/ThemeMenu';
import { MenuBar } from './MenuBar';
import { OptionsBar } from './OptionsBar';
import { PanelTabs } from './PanelTabs';
import { AppMark, ProjectTitle } from './ProjectTitle';
import { StatusBar } from './StatusBar';
import { ToolBar } from './ToolBar';
import { PaintSwatches } from './PaintSwatches';

export function DesktopLayout() {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
        <div className="flex min-w-0 items-center gap-1">
          <AppMark />
          <MenuBar />
        </div>
        <div className="flex min-w-0 max-w-80 justify-center">
          <ProjectTitle />
        </div>
        <div className="flex items-center justify-end gap-1">
          <ThemeMenu />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <aside className="flex w-13 shrink-0 flex-col items-center overflow-y-auto rounded-xl border bg-card shadow-xs">
          <ToolBar />
          <div className="mt-auto w-full border-t">
            <PaintSwatches />
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="shrink-0 border-b">
            <OptionsBar />
          </div>
          <div className="min-h-0 flex-1">
            <CanvasView />
          </div>
          <div className="shrink-0 border-t">
            <StatusBar />
          </div>
        </main>
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs" aria-label="Panels">
          <PanelTabs />
        </aside>
      </div>
    </div>
  );
}
