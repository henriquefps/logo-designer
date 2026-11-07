import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorStore, type PanelTab } from '@/store/useEditorStore';
import { PropertiesPanel } from '@/panels/properties/PropertiesPanel';
import { LayersPanel } from '@/panels/layers/LayersPanel';
import { AssetsPanel } from '@/panels/assets/AssetsPanel';

/** Properties / Layers / Assets. Used in the right panel (desktop) and the bottom sheet (phones). */
export function PanelTabs() {
  const tab = useEditorStore((s) => s.panelTab);
  const setTab = useEditorStore((s) => s.setPanelTab);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="shrink-0 border-b p-2">
        <TabsList className="w-full">
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="properties" className="min-h-0 overflow-y-auto overscroll-contain">
        <PropertiesPanel />
      </TabsContent>
      <TabsContent value="layers" className="min-h-0 overflow-y-auto overscroll-contain">
        <LayersPanel />
      </TabsContent>
      <TabsContent value="assets" className="min-h-0 overflow-y-auto overscroll-contain">
        <AssetsPanel />
      </TabsContent>
    </Tabs>
  );
}
