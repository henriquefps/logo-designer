import { useEffect, useMemo, useState } from 'react';
import { ArrowClockwiseIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { FieldRow, Section } from '@/panels/shared/Section';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { PHOSPHOR_PREFIX, PHOSPHOR_WEIGHTS, filterPhosphor, loadLucide, matchesQuery, type IconMap, type IconSource, type PhosphorWeight } from './catalog';
import { IconGrid, ICON_DRAG_MIME } from './IconGrid';
import { listCollection, licenseNeedsAttribution, loadCollections, searchIcons } from './iconify';
import { DEFAULT_ICON_RATIO, insertIcon, parseRefKey, refKey, type IconRef } from './insert';
import { useIconOptions, useIconPrefs } from './stores';
import { useAsync, useDebounced } from './useAsync';

type View = 'all' | 'favorites' | 'recent';
const ALL = '__all__';

const INFO = { lucide: 'Lucide · ISC license', phosphor: 'Phosphor · MIT license (loaded from Iconify on demand)' };

/** Dropping an icon from the grid onto the canvas inserts it at the drop point. */
function useCanvasDrop() {
  useEffect(() => {
    const canvasOf = (e: DragEvent) => ((e.target as Element | null)?.closest?.('[data-slot="canvas"]') as HTMLElement | null) ?? null;
    const isIcon = (e: DragEvent) => !!e.dataTransfer?.types.includes(ICON_DRAG_MIME);
    const onOver = (e: DragEvent) => {
      if (!isIcon(e) || !canvasOf(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      const canvas = canvasOf(e);
      if (!canvas || !isIcon(e)) return;
      e.preventDefault();
      const ref = parseRefKey(e.dataTransfer?.getData(ICON_DRAG_MIME) ?? '');
      if (!ref) return;
      const r = canvas.getBoundingClientRect();
      const at = useEditorStore.getState().screenToDoc({ x: e.clientX - r.left, y: e.clientY - r.top });
      insert(ref, at);
    };
    document.addEventListener('dragover', onOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);
}

function insert(ref: IconRef, at?: { x: number; y: number }) {
  insertIcon(ref, at).then(
    (ok) => ok || toast.error('This icon has no drawable shapes'),
    () => toast.error('Could not load the icon. Check your connection.'),
  );
}

export function IconsPanel() {
  useCanvasDrop();
  const o = useIconOptions();
  const { favorites, recents, toggleFavorite } = useIconPrefs();
  const artboard = useDocStore((s) => s.doc.artboard);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');
  const [retry, setRetry] = useState(0);
  const debounced = useDebounced(query, 300);

  const bundled = o.source === 'lucide';
  const phosphor = o.source === 'phosphor';
  const bundledState = useAsync<IconMap>(bundled ? 'lucide' : null, () => loadLucide());
  const collectionsState = useAsync(o.source === 'iconify' ? `collections:${retry}` : null, loadCollections);
  const collections = collectionsState.data;
  const collection = collections?.find((c) => c.prefix === o.collection) ?? null;

  const iconifyKey = phosphor
    ? view === 'all'
      ? `ph|${o.weight}|${retry}`
      : null
    : o.source === 'iconify' && view === 'all' && collections
      ? `${o.collection ?? ALL}|${debounced.trim()}|${retry}`
      : null;
  const iconifyState = useAsync<string[]>(iconifyKey, () => {
    if (phosphor) return listCollection(PHOSPHOR_PREFIX).then((ids) => filterPhosphor(ids, o.weight));
    const q = debounced.trim();
    if (q) return searchIcons(q, o.collection);
    return o.collection ? listCollection(o.collection) : Promise.resolve([]);
  });

  // Bundled maps used for previews (favorites/recents can mix sources).
  const lucideMap = useAsync<IconMap>(view !== 'all' || bundled ? 'lucide' : null, () => loadLucide()).data;

  const items = useMemo<IconRef[]>(() => {
    const fromKeys = (keys: string[]) =>
      keys
        .map(parseRefKey)
        .filter((r): r is IconRef => !!r)
        .filter((r) => matchesQuery(r.id, query));
    if (view === 'favorites') return fromKeys(favorites);
    if (view === 'recent') return fromKeys(recents);
    if (bundled) {
      const names = Object.keys(bundledState.data ?? {}).filter((n) => matchesQuery(n, query));
      return names.map((id) => ({ source: 'lucide' as const, id }));
    }
    const ids = iconifyState.data ?? [];
    return (phosphor ? ids.filter((id) => matchesQuery(id, query)) : ids).map((id) => ({ source: 'iconify' as const, id }));
  }, [view, favorites, recents, bundled, phosphor, bundledState.data, query, iconifyState.data]);

  const loading = view === 'all' && (bundled ? bundledState.loading : (!phosphor && collectionsState.loading) || iconifyState.loading);
  const error = view === 'all' && !bundled ? (phosphor ? undefined : collectionsState.error) ?? iconifyState.error : undefined;
  const empty = loading
    ? 'Loading…'
    : error
      ? 'Could not reach the Iconify API.'
      : view === 'favorites'
        ? 'Star icons to keep them here.'
        : view === 'recent'
          ? 'Icons you insert show up here.'
          : o.source === 'iconify' && !query.trim() && !o.collection
            ? 'Search icons across all open-license collections, or pick a collection.'
            : 'No icons match your search.';

  const defaultSize = Math.round(Math.min(artboard.width, artboard.height) * DEFAULT_ICON_RATIO);
  const numberOrNull = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <div className="flex flex-col">
      <Section title="Library">
        <Select value={o.source} onValueChange={(v) => o.set({ source: v as IconSource })}>
          <SelectTrigger size="sm" className="w-full" aria-label="Icon source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lucide">Lucide</SelectItem>
            <SelectItem value="phosphor">Phosphor</SelectItem>
            <SelectItem value="iconify">Iconify (open licenses)</SelectItem>
          </SelectContent>
        </Select>
        {o.source === 'iconify' && (
          <Select value={o.collection ?? ALL} onValueChange={(v) => o.set({ collection: v === ALL ? null : v })}>
            <SelectTrigger size="sm" className="w-full" aria-label="Iconify collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All open collections</SelectItem>
              {(collections ?? []).map((c) => (
                <SelectItem key={c.prefix} value={c.prefix}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {bundled || phosphor
            ? INFO[o.source as 'lucide' | 'phosphor']
            : collection
              ? `${collection.name} · ${collection.license.title}${collection.author ? ` · ${collection.author}` : ''}${licenseNeedsAttribution(collection.license.spdx) ? ' · attribution required' : ''}`
              : 'Each icon keeps its collection license. Only open licenses are listed.'}
        </p>
      </Section>

      <Section title="Insert options">
        <FieldRow label="Color">
          <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input shadow-xs">
            <span className="absolute inset-0" style={{ backgroundColor: o.color }} />
            <input type="color" aria-label="Icon color" className="absolute inset-0 size-full cursor-pointer opacity-0" value={o.color} onChange={(e) => o.set({ color: e.target.value })} />
          </label>
          <span className="font-mono text-sm uppercase">{o.color}</span>
        </FieldRow>
        <FieldRow label="Size">
          <Input
            type="number"
            min={1}
            aria-label="Icon size in pixels"
            className="h-8"
            placeholder={`${defaultSize} (25%)`}
            value={o.size ?? ''}
            onChange={(e) => o.set({ size: numberOrNull(e.target.value) })}
          />
          <span className="text-sm text-muted-foreground">px</span>
        </FieldRow>
        <FieldRow label="Stroke">
          <Input
            type="number"
            min={0.25}
            step={0.25}
            aria-label="Stroke width"
            className="h-8"
            placeholder="Auto"
            value={o.strokeWidth ?? ''}
            onChange={(e) => o.set({ strokeWidth: numberOrNull(e.target.value) })}
          />
        </FieldRow>
        {phosphor && (
          <FieldRow label="Weight">
            <Select value={o.weight} onValueChange={(v) => o.set({ weight: v as PhosphorWeight })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Phosphor weight">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHOSPHOR_WEIGHTS.map((w) => (
                  <SelectItem key={w} value={w} className="capitalize">
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        )}
      </Section>

      <Section title="Icons" actions={<span className="text-xs text-muted-foreground">{loading ? '' : `${items.length.toLocaleString()}`}</span>}>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search icons…" aria-label="Search icons" className="h-8 pl-8" />
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as View)} className="w-full">
          <ToggleGroupItem value="all" className="flex-1">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="favorites" className="flex-1">
            Favorites
          </ToggleGroupItem>
          <ToggleGroupItem value="recent" className="flex-1">
            Recent
          </ToggleGroupItem>
        </ToggleGroup>
        <IconGrid items={items} maps={{ lucide: lucideMap }} favorites={favorites} onPick={(r) => insert(r)} onToggleFavorite={(r) => toggleFavorite(refKey(r))} empty={empty} />
        {error && (
          <Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>
            <ArrowClockwiseIcon /> Retry
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Click to insert in the center, or drag onto the canvas.</p>
      </Section>
    </div>
  );
}
