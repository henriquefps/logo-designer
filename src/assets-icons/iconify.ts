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

/** SVG markup of one icon, built from the batched JSON endpoint (same data as the grid thumbnails). */
export const fetchIconifySvg = (id: string): Promise<string> =>
  cached(`svg:${id}`, 365 * DAY, async () => {
    for (let attempt = 0; ; attempt++) {
      const t = await requestThumb(id);
      if (t) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t.width} ${t.height}">${t.body}</svg>`;
      if (attempt >= 2) throw new Error(`Iconify icon ${id} not available`);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  });

export interface Thumb {
  body: string;
  width: number;
  height: number;
}

const thumbs = new Map<string, Thumb | null>();
const waiting = new Map<string, ((t: Thumb | null) => void)[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH = 40;

/** Drops anything executable from third-party SVG body markup. */
export const sanitizeBody = (body: string): string =>
  body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');

async function flush() {
  flushTimer = null;
  const pending = [...waiting.entries()];
  waiting.clear();
  const byPrefix = new Map<string, string[]>();
  for (const [id] of pending) {
    const [prefix, name] = splitId(id);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  const results = new Map<string, Thumb>();
  await Promise.all(
    [...byPrefix].flatMap(([prefix, names]) =>
      Array.from({ length: Math.ceil(names.length / BATCH) }, (_, i) => names.slice(i * BATCH, (i + 1) * BATCH)).map(async (chunk) => {
        try {
          const res = await fetch(`${ICONIFY_API}/${prefix}.json?icons=${chunk.map(encodeURIComponent).join(',')}`);
          if (!res.ok) return;
          const data = (await res.json()) as { width?: number; height?: number; icons?: Record<string, { body: string; width?: number; height?: number }> };
          for (const [name, ic] of Object.entries(data.icons ?? {})) {
            results.set(`${prefix}:${name}`, { body: sanitizeBody(ic.body), width: ic.width ?? data.width ?? 16, height: ic.height ?? data.height ?? 16 });
          }
        } catch {
          /* leave unresolved: resolves to null below, retried on next mount */
        }
      }),
    ),
  );
  for (const [id, resolvers] of pending) {
    const t = results.get(id) ?? null;
    if (t) thumbs.set(id, t);
    resolvers.forEach((r) => r(t));
  }
}

/** Grid thumbnails: requests made in the same tick are batched into one `/{prefix}.json?icons=` call. */
export function requestThumb(id: string): Promise<Thumb | null> {
  const hit = thumbs.get(id);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    waiting.set(id, [...(waiting.get(id) ?? []), resolve]);
    flushTimer ??= setTimeout(() => void flush(), 16);
  });
}
