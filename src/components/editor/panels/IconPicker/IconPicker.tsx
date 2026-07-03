import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlassIcon, StarIcon } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { getLucideIconNames } from '@/lib/icons/lucideIconNames';
import { getPhosphorIconNames } from '@/lib/icons/phosphorIconNames';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { createId } from '@/lib/id';
import type { IconElement, IconLibrary } from '@/types/element';
import { IconGrid } from './IconGrid';

const DEFAULT_COLOR = '#211f1a';

function iconKey(library: IconLibrary, name: string) {
  return `${library}:${name}`;
}

export function IconPicker() {
  const [library, setLibrary] = useState<IconLibrary>('lucide');
  const [search, setSearch] = useState('');
  const [names, setNames] = useState<string[]>([]);

  const favoriteIcons = useUIStore((s) => s.favoriteIcons);
  const recentIcons = useUIStore((s) => s.recentIcons);
  const toggleFavoriteIcon = useUIStore((s) => s.toggleFavoriteIcon);
  const pushRecentIcon = useUIStore((s) => s.pushRecentIcon);
  const setSelection = useUIStore((s) => s.setSelection);

  useEffect(() => {
    let cancelled = false;
    const loadNames = library === 'lucide' ? getLucideIconNames : getPhosphorIconNames;
    loadNames().then((loaded) => {
      if (!cancelled) setNames(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [library]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return names;
    return names.filter((name) => name.toLowerCase().includes(term));
  }, [names, search]);

  const favoritesInLibrary = useMemo(
    () =>
      favoriteIcons
        .filter((key) => key.startsWith(`${library}:`))
        .map((key) => key.slice(library.length + 1))
        .filter((name) => names.includes(name)),
    [favoriteIcons, library, names],
  );
  const recentsInLibrary = useMemo(
    () =>
      recentIcons
        .filter((key) => key.startsWith(`${library}:`))
        .map((key) => key.slice(library.length + 1))
        .filter((name) => names.includes(name)),
    [recentIcons, library, names],
  );

  const handlePick = (name: string) => {
    const element: IconElement = {
      id: createId(),
      type: 'icon',
      iconType: library,
      name,
      x: 256,
      y: 256,
      size: 120,
      color: DEFAULT_COLOR,
      strokeWidth: library === 'lucide' ? 2 : undefined,
      weight: library === 'phosphor' ? 'regular' : undefined,
      rotation: 0,
      opacity: 100,
      flipH: false,
      flipV: false,
      locked: false,
    };
    useProjectStore.getState().addElement(element);
    setSelection([element.id]);
    pushRecentIcon(iconKey(library, name));
  };

  const handleToggleFavorite = (name: string) => toggleFavoriteIcon(iconKey(library, name));
  const isFavorite = (name: string) => favoriteIcons.includes(iconKey(library, name));

  return (
    <div className="space-y-3">
      <ToggleGroup type="single" variant="outline" value={library} onValueChange={(v: IconLibrary) => v && setLibrary(v)} className="grid grid-cols-2">
        <ToggleGroupItem value="lucide">Lucide</ToggleGroupItem>
        <ToggleGroupItem value="phosphor">Phosphor</ToggleGroupItem>
      </ToggleGroup>

      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${library} icons…`} className="h-8 pl-8 text-sm" />
      </div>

      {!search && favoritesInLibrary.length > 0 && (
        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-xs text-muted-foreground">
            <StarIcon className="size-3" weight="fill" /> Favorites
          </Label>
          <IconGrid names={favoritesInLibrary} library={library} onPick={handlePick} isFavorite={isFavorite} onToggleFavorite={handleToggleFavorite} />
        </div>
      )}

      {!search && recentsInLibrary.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Recent</Label>
          <IconGrid names={recentsInLibrary} library={library} onPick={handlePick} isFavorite={isFavorite} onToggleFavorite={handleToggleFavorite} />
        </div>
      )}

      <div className="space-y-1">
        {(favoritesInLibrary.length > 0 || recentsInLibrary.length > 0) && !search && <Label className="text-xs text-muted-foreground">All icons</Label>}
        <IconGrid names={filtered} library={library} onPick={handlePick} isFavorite={isFavorite} onToggleFavorite={handleToggleFavorite} />
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} icon{filtered.length === 1 ? '' : 's'} {search ? 'found' : 'available'}. Hover an icon and click the star to favorite it.
      </p>
    </div>
  );
}
