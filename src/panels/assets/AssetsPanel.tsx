import { PackageIcon } from '@phosphor-icons/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAssetSources } from './registry';

export function AssetsPanel() {
  const sources = getAssetSources();
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
    <Tabs defaultValue={sources[0].id} className="gap-0">
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
