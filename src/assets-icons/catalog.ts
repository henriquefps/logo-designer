import { createElement, type ComponentType } from 'react';

export type IconSource = 'lucide' | 'phosphor' | 'iconify';
export type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
export const PHOSPHOR_WEIGHTS: PhosphorWeight[] = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconComponent = ComponentType<any>;
export type IconMap = Record<string, IconComponent>;

let lucide: Promise<IconMap> | null = null;
let phosphor: Promise<IconMap> | null = null;

const NOT_ICONS = new Set(['IconContext', 'IconBase', 'Icon', 'SSR']);

/** Bundled libraries are loaded lazily (own chunks) the first time the tab needs them. */
export function loadLucide(): Promise<IconMap> {
  return (lucide ??= import('lucide-react').then((m) => m.icons as unknown as IconMap));
}

export function loadPhosphor(): Promise<IconMap> {
  return (phosphor ??= import('@phosphor-icons/react/dist/ssr').then((m) => {
    const map: IconMap = {};
    for (const [k, v] of Object.entries(m)) {
      if (/^[A-Z]/.test(k) && !k.endsWith('Icon') && !NOT_ICONS.has(k) && typeof v !== 'string') map[k] = v as IconComponent;
    }
    return map;
  }));
}

export const loadBundled = (source: 'lucide' | 'phosphor') => (source === 'lucide' ? loadLucide() : loadPhosphor());

/** "ArrowUpRight" → "arrow-up-right" */
export const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();

/** Case/space/dash-insensitive substring match: "arrow up" matches ArrowUpRight. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!q) return true;
  return name.toLowerCase().replace(/[\s_:-]+/g, '').includes(q);
}

/** SVG markup of a bundled icon (rendered with React, so it always matches the preview). */
export async function bundledSvg(source: 'lucide' | 'phosphor', name: string, weight: PhosphorWeight): Promise<string> {
  const [map, { renderToStaticMarkup }] = await Promise.all([loadBundled(source), import('react-dom/server')]);
  const Comp = map[name];
  if (!Comp) throw new Error(`Unknown icon ${name}`);
  return renderToStaticMarkup(createElement(Comp, source === 'phosphor' ? { weight } : {}));
}
