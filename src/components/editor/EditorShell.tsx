import { PlusCircleIcon, PaintBucketIcon, StackIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useUIStore, type EditorTab } from '@/store/useUIStore';
import { useActiveProject } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { Toolbar } from './Toolbar';
import { CanvasStage } from './Canvas/CanvasStage';
import { BackgroundPanel } from './panels/BackgroundPanel';
import { AddPanel } from './panels/AddPanel';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ExportPanel } from './panels/ExportPanel';

const TAB_ITEMS: { value: EditorTab; label: string; icon: React.ComponentType<{ className?: string; weight?: 'regular' | 'fill' }> }[] = [
  { value: 'add', label: 'Add', icon: PlusCircleIcon },
  { value: 'background', label: 'Background', icon: PaintBucketIcon },
  { value: 'layers', label: 'Layers', icon: StackIcon },
  { value: 'export', label: 'Export', icon: DownloadSimpleIcon },
];

function PanelBody({ tab, selectedCount }: { tab: EditorTab; selectedCount: number }) {
  switch (tab) {
    case 'add':
      return <AddPanel />;
    case 'background':
      return <BackgroundPanel />;
    case 'layers':
      return (
        <>
          <LayersPanel />
          {selectedCount > 0 && (
            <>
              <div className="mx-4 my-2 border-t border-border" />
              <PropertiesPanel />
            </>
          )}
        </>
      );
    case 'export':
      return <ExportPanel />;
  }
}

function DesktopSidebar() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const selectedIds = useUIStore((s) => s.selectedIds);
  const project = useActiveProject();

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EditorTab)} className="flex h-full flex-col gap-0">
      <TabsList className="mt-3 grid w-full grid-cols-4 gap-1">
        {TAB_ITEMS.map(({ value, label }) => (
          <TabsTrigger key={value} value={value} className="min-w-0 px-1.5 tracking-normal">
            <span className="truncate">{value === 'layers' && project ? `${label} (${project.elements.length})` : label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <ScrollArea className="min-h-0 flex-1">
        {TAB_ITEMS.map(({ value }) => (
          <TabsContent key={value} value={value} className="mt-0">
            <PanelBody tab={value} selectedCount={selectedIds.length} />
          </TabsContent>
        ))}
      </ScrollArea>
    </Tabs>
  );
}

function MobileTabBar() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const mobilePanelOpen = useUIStore((s) => s.mobilePanelOpen);
  const setMobilePanelOpen = useUIStore((s) => s.setMobilePanelOpen);
  const project = useActiveProject();

  return (
    <nav className="grid h-14 shrink-0 grid-cols-4 border-t border-border bg-background md:hidden">
      {TAB_ITEMS.map(({ value, label, icon: Icon }) => {
        const active = mobilePanelOpen && activeTab === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => {
              setActiveTab(value);
              setMobilePanelOpen(true);
            }}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors',
              active && 'text-foreground',
            )}
          >
            <Icon className="size-5" weight={active ? 'fill' : 'regular'} />
            <span className="truncate px-1">{value === 'layers' && project ? `${label} (${project.elements.length})` : label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** A modal sheet's backdrop necessarily covers the persistent bottom nav, so while it's open,
 * tab switching happens through this compact strip living inside the sheet itself instead. */
function MobilePanelSheet() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const selectedIds = useUIStore((s) => s.selectedIds);
  const mobilePanelOpen = useUIStore((s) => s.mobilePanelOpen);
  const setMobilePanelOpen = useUIStore((s) => s.setMobilePanelOpen);
  const project = useActiveProject();

  return (
    <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
      <SheetContent side="bottom" className="flex flex-col gap-0 p-0 data-[side=bottom]:bottom-14 data-[side=bottom]:h-[70vh]">
        <SheetHeader className="flex-row items-center gap-1 border-b border-border px-2 py-2 pr-12">
          <SheetTitle className="sr-only">Edit logo</SheetTitle>
          {TAB_ITEMS.map(({ value, label, icon: Icon }) => {
            const active = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium text-muted-foreground transition-colors',
                  active && 'bg-accent text-foreground',
                )}
              >
                <Icon className="size-4" weight={active ? 'fill' : 'regular'} />
                <span className="truncate px-0.5">{value === 'layers' && project ? `${label} (${project.elements.length})` : label}</span>
              </button>
            );
          })}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <PanelBody tab={activeTab} selectedCount={selectedIds.length} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export function EditorShell() {
  return (
    <div className="flex h-dvh flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[360px] shrink-0 overflow-hidden border-r border-border md:block md:min-h-0">
          <DesktopSidebar />
        </aside>
        <CanvasStage />
      </div>

      <MobileTabBar />
      <MobilePanelSheet />
    </div>
  );
}
