import { CaretUpDownIcon, CheckIcon, MagnifyingGlassIcon, WarningIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { allFamilies, cssFontStack, findFamily, requestFace, useFontStore } from '../store';
import type { FontFamilyInfo } from '../types';

const CATEGORY: Record<NonNullable<FontFamilyInfo['category']>, string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  script: 'Script',
  mono: 'Monospace',
};

/** Loads the first face of a family so its name can preview in its own font. */
const preview = (f: FontFamilyInfo) => requestFace(f.faces[0].key);

export function FontPreviewName({ family, className }: { family: string; className?: string }) {
  const info = findFamily(family);
  useFontStore((s) => s.version);
  useEffect(() => {
    if (info) preview(info);
  }, [info]);
  return (
    <span className={cn('truncate', className)} style={info ? { fontFamily: cssFontStack(info.family) } : undefined}>
      {info?.family ?? family}
    </span>
  );
}

/**
 * Searchable font family picker; each family previews in its own font.
 * `value` null = mixed selection.
 */
export function FontFamilyPicker({ value, onChange, className }: { value: string | null; onChange: (family: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const uploads = useFontStore((s) => s.uploads);
  const ready = useFontStore((s) => s.uploadsReady);
  useFontStore((s) => s.version);
  const listRef = useRef<HTMLDivElement>(null);
  const families = allFamilies(uploads);
  const current = value ? findFamily(value) : null;
  const missing = value !== null && !current && ready;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? families.filter((f) => f.family.toLowerCase().includes(q) || (f.category && CATEGORY[f.category].toLowerCase().includes(q))) : families;
  }, [families, query]);

  useEffect(() => {
    if (open) for (const f of families) preview(f);
  }, [open, families]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (f: FontFamilyInfo) => {
    onChange(f.family);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setActive(Math.max(0, families.findIndex((f) => f.family === current?.family)));
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label="Font family" className={cn('h-8 w-full justify-between gap-2 px-2.5 font-normal', className)}>
          {value === null ? (
            <span className="truncate text-muted-foreground">Mixed</span>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5">
              {missing && <WarningIcon className="text-warning" aria-label="Missing font" />}
              <FontPreviewName family={value} className="text-sm" />
            </span>
          )}
          <CaretUpDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 gap-0 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <MagnifyingGlassIcon className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            aria-label="Search fonts"
            placeholder="Search fonts"
            className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(filtered.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && filtered[active]) {
                e.preventDefault();
                pick(filtered[active]);
              }
            }}
          />
        </div>
        <div ref={listRef} role="listbox" aria-label="Fonts" className="max-h-72 overflow-y-auto overscroll-contain p-1">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No fonts match “{query}”.</p>}
          {filtered.map((f, i) => {
            const selected = f.family === current?.family;
            return (
              <div
                key={`${f.source}:${f.family}`}
                role="option"
                aria-selected={selected}
                data-index={i}
                onPointerMove={() => setActive(i)}
                onClick={() => pick(f)}
                className={cn('flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5', i === active && 'bg-accent text-accent-foreground')}
              >
                <span className="min-w-0 flex-1 truncate text-base" style={{ fontFamily: cssFontStack(f.family) }}>
                  {f.family}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{f.source === 'upload' ? 'Uploaded' : f.category ? CATEGORY[f.category] : ''}</span>
                <CheckIcon className={cn('shrink-0', !selected && 'invisible')} />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
