import { PackageIcon } from '@phosphor-icons/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocStore } from '@/store/useDocStore';
import { getAssetSources } from './registry';

const all = getAssetSources();

export function AssetsPanel() {
  // Ids of the sources this document shows (a string, so edits that do not change it do not re-render).
  const shown = useDocStore((st) => all.filter((s) => !s.when || s.when(st.doc)).map((s) => s.id).join());
  const sources = all.filter((s) => shown.split(',').includes(s.id));
  if (!sources.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <PackageIcon className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Icon libraries and fonts will appear here.</p>
      </div>
    );
  }
  if (sources.length === 1) {
    const { Component } = sources[0];
    return <Component />;
  }
  return (
    <Tabs key={shown} defaultValue={sources[0].id} className="gap-0">
      <div className="border-b px-4 py-2">
        <TabsList className="w-full">
          {sources.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id}>
              <Icon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {sources.map(({ id, Component }) => (
        <TabsContent key={id} value={id}>
          <Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}
