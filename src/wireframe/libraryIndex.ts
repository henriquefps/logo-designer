// What the library panel lists: search and the platform-first ordering. Pure (tested).
import type { ScreenPlatform } from '@/model';
import type { AnyComponentDef } from './library/types';

export const forPlatform = (def: AnyComponentDef, p: ScreenPlatform | null) => !p || def.platforms === 'all' || def.platforms.includes(p);

/** Case-insensitive match on label, kind, category and keywords (every word must match). */
export function matchesComponent(def: AnyComponentDef, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [def.label, def.kind, def.category, ...(def.keywords ?? [])].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export interface LibraryGroup {
  category: string;
  items: AnyComponentDef[];
}

const group = (defs: AnyComponentDef[]): LibraryGroup[] => {
  const map = new Map<string, AnyComponentDef[]>();
  for (const d of defs) map.set(d.category, [...(map.get(d.category) ?? []), d]);
  return [...map].map(([category, items]) => ({ category, items }));
};

/**
 * The library for a platform: `main` = components for that platform (and common ones) by category,
 * `others` = the rest (other platforms only), still reachable. With no platform everything is main.
 */
export function libraryFor(defs: readonly AnyComponentDef[], platform: ScreenPlatform | null, query = ''): { main: LibraryGroup[]; others: LibraryGroup[] } {
  const hits = defs.filter((d) => !d.hidden && matchesComponent(d, query));
  return { main: group(hits.filter((d) => forPlatform(d, platform))), others: group(hits.filter((d) => !forPlatform(d, platform))) };
}
