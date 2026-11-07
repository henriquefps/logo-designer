import { createStore, get, set } from 'idb-keyval';

const memory = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
let store: ReturnType<typeof createStore> | null = null;
const idb = () => (store ??= createStore('designer-icons', 'cache'));

interface Entry<T> {
  at: number;
  value: T;
}

/** Memory → IndexedDB → network. IndexedDB failures (private mode, SSR/tests) are ignored. */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  if (memory.has(key)) return memory.get(key) as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const run = (async () => {
    try {
      const hit = await get<Entry<T>>(key, idb());
      if (hit && Date.now() - hit.at < ttlMs) {
        memory.set(key, hit.value);
        return hit.value;
      }
    } catch {
      /* no IndexedDB */
    }
    const value = await fetcher();
    memory.set(key, value);
    set(key, { at: Date.now(), value } satisfies Entry<T>, idb()).catch(() => undefined);
    return value;
  })();
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export const clearMemoryCache = () => memory.clear();
