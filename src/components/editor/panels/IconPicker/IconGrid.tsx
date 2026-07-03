import { StarIcon } from '@phosphor-icons/react';
import { useVirtualGrid } from '@/hooks/useVirtualGrid';
import { useIconModule } from '@/hooks/useIconModule';
import type { IconLibrary } from '@/types/element';
import { cn } from '@/lib/utils';

const ITEM_SIZE = 40;
const GAP = 6;

interface IconGridProps {
  names: string[];
  library: IconLibrary;
  onPick: (name: string) => void;
  isFavorite?: (name: string) => boolean;
  onToggleFavorite?: (name: string) => void;
}

export function IconGrid({ names, library, onPick, isFavorite, onToggleFavorite }: IconGridProps) {
  const mod = useIconModule(names.length > 0 ? library : null);
  const { containerRef, columns, totalHeight, startIndex, endIndex, offsetTop } = useVirtualGrid(names.length, { itemSize: ITEM_SIZE, gap: GAP });
  const visible = names.slice(startIndex, endIndex);

  return (
    <div ref={containerRef} className="h-56 overflow-y-auto rounded-md border border-input bg-muted/30 p-2">
      {names.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">No icons match your search.</p>
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0, display: 'grid', gridTemplateColumns: `repeat(${columns}, ${ITEM_SIZE}px)`, gap: GAP }}>
            {visible.map((name) => {
              const Icon = mod?.[name];
              const favorited = isFavorite?.(name) ?? false;
              return (
                <div key={name} className="group relative" style={{ width: ITEM_SIZE, height: ITEM_SIZE }}>
                  <button
                    type="button"
                    title={name}
                    onClick={() => onPick(name)}
                    className="flex size-full items-center justify-center rounded-md border border-transparent bg-background text-foreground transition-colors hover:border-primary hover:bg-accent"
                  >
                    {Icon ? <Icon size={18} /> : null}
                  </button>
                  {onToggleFavorite && (
                    <button
                      type="button"
                      title={favorited ? `Unstar ${name}` : `Favorite ${name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(name);
                      }}
                      className={cn(
                        'absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground transition-opacity',
                        favorited ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 hover:text-primary',
                      )}
                    >
                      <StarIcon size={11} weight={favorited ? 'fill' : 'regular'} className={favorited ? 'text-primary' : undefined} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
