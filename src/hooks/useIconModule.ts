import { useEffect, useState } from 'react';
import { loadLucideModule, loadPhosphorModule, type IconModule } from '@/lib/icons/iconModules';
import type { IconLibrary } from '@/types/element';

const loaders: Record<IconLibrary, () => Promise<IconModule>> = {
  lucide: loadLucideModule,
  phosphor: loadPhosphorModule,
};

/** Resolves to the icon module once its (dynamically imported, cached) chunk has loaded. Pass `null` to skip loading. */
export function useIconModule(library: IconLibrary | null): IconModule | null {
  const [mod, setMod] = useState<IconModule | null>(null);

  useEffect(() => {
    if (!library) return;
    let cancelled = false;
    loaders[library]().then((loaded) => {
      if (!cancelled) setMod(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [library]);

  return mod;
}
