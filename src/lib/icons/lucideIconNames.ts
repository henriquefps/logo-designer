import { loadLucideModule } from './iconModules';

const EXCLUDED_KEYS = new Set(['createLucideIcon', 'default', 'LucideIcon', 'icons']);

let cached: Promise<string[]> | null = null;

export function getLucideIconNames(): Promise<string[]> {
  if (!cached) {
    cached = loadLucideModule().then((mod) =>
      Object.keys(mod).filter((key) => !EXCLUDED_KEYS.has(key) && /^[A-Z]/.test(key) && !key.startsWith('Lucide') && !key.endsWith('Icon')),
    );
  }
  return cached;
}
