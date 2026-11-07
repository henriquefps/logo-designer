import { useEffect, useState } from 'react';

interface Result<T> {
  key: string;
  data?: T;
  error?: string;
}

/** Runs `load` whenever `key` changes. `loading` is derived (no synchronous setState in the effect). */
export function useAsync<T>(key: string | null, load: () => Promise<T>): { data: T | undefined; loading: boolean; error: string | undefined } {
  const [res, setRes] = useState<Result<T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    load().then(
      (data) => live && setRes({ key, data }),
      (e: unknown) => live && setRes({ key, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
    // `load` is intentionally keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const fresh = key !== null && res?.key === key;
  return { data: fresh ? res.data : undefined, loading: key !== null && !fresh, error: fresh ? res.error : undefined };
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
