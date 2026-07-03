import { loadPhosphorModule } from './iconModules';

const EXCLUDED_KEYS = new Set(['IconContext', 'IconBase', 'Icon']);

let cached: Promise<string[]> | null = null;

export function getPhosphorIconNames(): Promise<string[]> {
  if (!cached) {
    cached = loadPhosphorModule().then((mod) => Object.keys(mod).filter((key) => !EXCLUDED_KEYS.has(key) && /^[A-Z]/.test(key) && !key.endsWith('Icon')));
  }
  return cached;
}
