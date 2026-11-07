import { StarIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { IconMap, PhosphorWeight } from './catalog';
import { iconifyUrl } from './iconify';
import { refKey, type IconRef } from './insert';
import { useVirtualGrid } from './useVirtualGrid';

export const ICON_DRAG_MIME = 'application/x-designer-icon';
const ITEM = 40;
const GAP = 6;

interface IconGridProps {
  items: IconRef[];
  maps: Partial<Record<'lucide' | 'phosphor', IconMap>>;
  weight: PhosphorWeight;
  favorites: string[];
  onPick: (ref: IconRef) => void;
  onToggleFavorite: (ref: IconRef) => void;
  empty: string;
}

export function IconGrid({ items, maps, weight, favorites, onPick, onToggleFavorite, empty }: IconGridProps) {
  const { containerRef, columns, totalHeight, startIndex, endIndex, offsetTop } = useVirtualGrid(items.length, { itemSize: ITEM, gap: GAP });
  return (
    <div ref={containerRef} className="h-80 overflow-y-auto rounded-md border bg-muted/30 p-2" data-testid="icon-grid">
      {items.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0, display: 'grid', gridTemplateColumns: `repeat(${columns}, ${ITEM}px)`, gap: GAP, justifyContent: 'space-between' }}>
            {items.slice(startIndex, endIndex).map((ref) => {
              const key = refKey(ref);
              const fav = favorites.includes(key);
              const Comp = ref.source === 'iconify' ? undefined : maps[ref.source]?.[ref.id];
              return (
                <div key={key} className="group relative" style={{ width: ITEM, height: ITEM }}>
                  <button
                    type="button"
                    draggable
                    title={ref.id}
                    aria-label={`Insert ${ref.id}`}
                    onClick={() => onPick(ref)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(ICON_DRAG_MIME, key);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="flex size-full cursor-grab items-center justify-center rounded-md border border-transparent bg-background text-foreground transition-colors hover:border-primary hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
                  >
                    {ref.source === 'iconify' ? (
                      <span
                        aria-hidden
                        className="size-5 bg-current"
                        style={{
                          maskImage: `url(${iconifyUrl(ref.id)})`,
                          WebkitMaskImage: `url(${iconifyUrl(ref.id)})`,
                          maskSize: 'contain',
                          WebkitMaskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          WebkitMaskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          WebkitMaskPosition: 'center',
                        }}
                      />
                    ) : Comp ? (
                      <Comp size={20} {...(ref.source === 'phosphor' ? { weight } : {})} />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    aria-label={fav ? `Remove ${ref.id} from favorites` : `Add ${ref.id} to favorites`}
                    aria-pressed={fav}
                    onClick={() => onToggleFavorite(ref)}
                    className={cn(
                      'absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs hover:text-primary focus-visible:opacity-100',
                      fav ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                  >
                    <StarIcon size={12} weight={fav ? 'fill' : 'regular'} className={fav ? 'text-primary' : undefined} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
