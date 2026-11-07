import { createElement, type ComponentType } from 'react';

export type IconSource = 'lucide' | 'phosphor' | 'iconify';
export type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
export const PHOSPHOR_WEIGHTS: PhosphorWeight[] = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconComponent = ComponentType<any>;
export type IconMap = Record<string, IconComponent>;

let lucide: Promise<IconMap> | null = null;

/** Lucide is bundled and loaded lazily (own chunks) the first time the tab needs them. */
export function loadLucide(): Promise<IconMap> {
  return (lucide ??= import('lucide-react').then((m) => m.icons as unknown as IconMap));
}


/** "ArrowUpRight" → "arrow-up-right" */
export const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();

/** Case/space/dash-insensitive substring match: "arrow up" matches ArrowUpRight. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!q) return true;
  return name.toLowerCase().replace(/[\s_:-]+/g, '').includes(q);
}

/** SVG markup of a bundled icon (rendered with React, so it always matches the preview). */
export async function bundledSvg(name: string): Promise<string> {
  const [map, { renderToStaticMarkup }] = await Promise.all([loadLucide(), import('react-dom/server')]);
  const Comp = map[name];
  if (!Comp) throw new Error(`Unknown icon ${name}`);
  return renderToStaticMarkup(createElement(Comp, {}));
}

/** Phosphor comes from Iconify's `ph` collection: one small SVG per icon and weight, cached after first use. */
export const PHOSPHOR_PREFIX = 'ph';
const WEIGHT_SUFFIX = /-(thin|light|bold|fill|duotone)$/;

export function phosphorWeightOf(name: string): PhosphorWeight {
  return (WEIGHT_SUFFIX.exec(name)?.[1] as PhosphorWeight | undefined) ?? 'regular';
}

/** Ids ("ph:heart-bold") of one weight out of the whole `ph` collection. */
export const filterPhosphor = (ids: string[], weight: PhosphorWeight): string[] => ids.filter((id) => phosphorWeightOf(id.slice(PHOSPHOR_PREFIX.length + 1)) === weight);
