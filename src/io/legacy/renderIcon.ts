import type { ComponentType } from 'react';
import { kebab, PHOSPHOR_PREFIX } from '@/assets-icons/catalog';
import { fetchIconifySvg } from '@/assets-icons/iconify';
import type { IconRenderer } from './logogo';

type IconModule = Record<string, unknown>;
let lucide: Promise<IconModule> | null = null;

/** Iconify id of a Phosphor React component name + weight: ("ArrowUpRight", "bold") → "ph:arrow-up-right-bold". */
export function phosphorIconifyId(name: string, weight = 'regular'): string {
  const base = kebab(name.replace(/Icon$/, ''));
  return `${PHOSPHOR_PREFIX}:${base}${weight && weight !== 'regular' ? `-${weight}` : ''}`;
}

/**
 * SVG markup of a LogoGo icon. Lucide renders the bundled React component (lazy chunk, same as the
 * Icons tab). Phosphor comes from Iconify's `ph` collection (256-unit viewBox, currentColor), like the
 * Icons tab, so the huge Phosphor React bundle is never shipped. Null when the icon is unknown/offline.
 */
export const renderLibraryIcon: IconRenderer = async ({ library, name, color, strokeWidth, weight }) => {
  if (library === 'phosphor') {
    try {
      return await fetchIconifySvg(phosphorIconifyId(name, weight));
    } catch {
      return null;
    }
  }
  const [{ createElement }, { renderToStaticMarkup }, mod] = await Promise.all([
    import('react'),
    import('react-dom/server'),
    (lucide ??= import('lucide-react') as Promise<IconModule>),
  ]);
  const Component = (mod[name] ?? mod[`${name}Icon`]) as ComponentType<Record<string, unknown>> | undefined;
  if (!Component) return null;
  return renderToStaticMarkup(createElement(Component, { size: 24, color, strokeWidth: strokeWidth ?? 2 }));
};
