import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useUIStore, type EditorTab } from '@/store/useUIStore';
import { useActiveProject } from '@/store/useProjectStore';
import { Toolbar } from './Toolbar';
import { CanvasStage } from './Canvas/CanvasStage';
import { BackgroundPanel } from './panels/BackgroundPanel';
import { AddPanel } from './panels/AddPanel';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ExportPanel } from './panels/ExportPanel';

function EditorPanelTabs() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const selectedIds = useUIStore((s) => s.selectedIds);
  const project = useActiveProject();

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EditorTab)} className="flex h-full flex-col gap-0">
      <TabsList className="mx-3 mt-3">
        <TabsTrigger value="add">Add</TabsTrigger>
        <TabsTrigger value="background">Background</TabsTrigger>
        <TabsTrigger value="layers">Layers{project ? ` (${project.elements.length})` : ''}</TabsTrigger>
        <TabsTrigger value="export">Export</TabsTrigger>
      </TabsList>

      <ScrollArea className="flex-1">
        <TabsContent value="add" className="mt-0">
          <AddPanel />
        </TabsContent>
        <TabsContent value="background" className="mt-0">
          <BackgroundPanel />
        </TabsContent>
        <TabsContent value="layers" className="mt-0">
          <LayersPanel />
          {selectedIds.length > 0 && (
            <>
              <div className="mx-4 my-2 border-t border-border" />
              <PropertiesPanel />
            </>
          )}
        </TabsContent>
        <TabsContent value="export" className="mt-0">
          <ExportPanel />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

export function EditorShell() {
  const mobilePanelOpen = useUIStore((s) => s.mobilePanelOpen);
  const setMobilePanelOpen = useUIStore((s) => s.setMobilePanelOpen);

  return (
    <div className="flex h-dvh flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[360px] shrink-0 border-r border-border md:block">
          <EditorPanelTabs />
        </aside>
        <CanvasStage />
      </div>

      <Button
        type="button"
        size="icon"
        className="fixed bottom-4 right-4 size-12 rounded-full shadow-lg md:hidden"
        onClick={() => setMobilePanelOpen(true)}
      >
        <SlidersHorizontalIcon className="size-5" />
      </Button>
      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetContent side="bottom" className="h-[80vh] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Edit logo</SheetTitle>
          </SheetHeader>
          <EditorPanelTabs />
        </SheetContent>
      </Sheet>
    </div>
  );
}
