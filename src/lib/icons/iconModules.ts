import type { ComponentType } from 'react';

export type IconModule = Record<string, ComponentType<Record<string, unknown>>>;

let lucideModule: Promise<IconModule> | null = null;
let phosphorModule: Promise<IconModule> | null = null;

/**
 * Both icon libraries are loaded via dynamic import so they land in their own
 * chunk instead of the initial bundle. The load is kicked off (and cached)
 * the first time any icon element needs rendering or the picker opens,
 * whichever happens first — either way it's off the critical initial-paint
 * path. Static per-icon imports aren't viable here since which icon to render
 * is only known at runtime (by name), which is inherently incompatible with
 * tree-shaking.
 */
export function loadLucideModule(): Promise<IconModule> {
  if (!lucideModule) lucideModule = import('lucide-react') as unknown as Promise<IconModule>;
  return lucideModule;
}

export function loadPhosphorModule(): Promise<IconModule> {
  if (!phosphorModule) phosphorModule = import('@phosphor-icons/react') as unknown as Promise<IconModule>;
  return phosphorModule;
}
