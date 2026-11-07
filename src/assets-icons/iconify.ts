import { cached } from './cache';

export const ICONIFY_API = 'https://api.iconify.design';

const DAY = 24 * 60 * 60 * 1000;

/** SPDX ids of licenses that allow free reuse (including commercial). Attribution is shown in the UI. */
const OPEN_LICENSES = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0', 'MPL-2.0',
  'CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0', 'OFL-1.1', 'WTFPL', 'Zlib',
]);

export const isOpenLicense = (spdx: string | undefined): boolean => !!spdx && OPEN_LICENSES.has(spdx);
export const licenseNeedsAttribution = (spdx: string | undefined): boolean => !!spdx && spdx.startsWith('CC-BY');

export interface IconifyCollection {
  prefix: string;
  name: string;
  total: number;
  category?: string;
  license: { title: string; spdx?: string; url?: string };
  author?: string;
  /** Multi-color collections ignore the color option. */
  palette: boolean;
}

interface RawCollection {
  name: string;
  total: number;
  category?: string;
  author?: { name?: string };
  license?: { title?: string; spdx?: string; url?: string };
  palette?: boolean;
}

export function parseCollections(raw: Record<string, RawCollection>): IconifyCollection[] {
  return Object.entries(raw)
    .filter(([, c]) => isOpenLicense(c.license?.spdx))
    .map(([prefix, c]) => ({
      prefix,
      name: c.name,
      total: c.total,
      category: c.category,
      license: { title: c.license?.title ?? c.license?.spdx ?? '', spdx: c.license?.spdx, url: c.license?.url },
      author: c.author?.name,
      palette: !!c.palette,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(ICONIFY_API + path);
  if (!res.ok) throw new Error(`Iconify ${res.status}`);
  return (await res.json()) as T;
}

export const loadCollections = (): Promise<IconifyCollection[]> =>
  cached('collections:v1', 7 * DAY, async () => parseCollections(await getJson('/collections')));

/** "prefix:name" ids. Results from collections with non open licenses are dropped. */
export async function searchIcons(query: string, prefix: string | null, limit = 240): Promise<string[]> {
  const collections = await loadCollections();
  const open = new Set(collections.map((c) => c.prefix));
  const q = new URLSearchParams({ query, limit: String(limit) });
  if (prefix) q.set('prefix', prefix);
  const key = `search:${q.toString()}`;
  return cached(key, DAY, async () => {
    const res = await getJson<{ icons: string[] }>(`/search?${q}`);
    return res.icons.filter((id) => open.has(id.slice(0, id.indexOf(':'))));
  });
}

/** Every icon of a collection as "prefix:name" ids. */
export const listCollection = (prefix: string): Promise<string[]> =>
  cached(`collection:${prefix}`, 7 * DAY, async () => {
    const res = await getJson<{ uncategorized?: string[]; categories?: Record<string, string[]> }>(`/collection?prefix=${encodeURIComponent(prefix)}`);
    const names = new Set<string>([...(res.uncategorized ?? []), ...Object.values(res.categories ?? {}).flat()]);
    return [...names].map((n) => `${prefix}:${n}`);
  });

export const iconifyUrl = (id: string): string => {
  const [prefix, name] = splitId(id);
  return `${ICONIFY_API}/${prefix}/${name}.svg`;
};

export function splitId(id: string): [string, string] {
  const i = id.indexOf(':');
  return [id.slice(0, i), id.slice(i + 1)];
}

export const fetchIconifySvg = (id: string): Promise<string> =>
  cached(`svg:${id}`, 365 * DAY, async () => {
    const res = await fetch(iconifyUrl(id));
    if (!res.ok) throw new Error(`Iconify ${res.status}`);
    return res.text();
  });
