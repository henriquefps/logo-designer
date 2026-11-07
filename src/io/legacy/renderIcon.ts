import type { ComponentType } from 'react';
import type { IconRenderer } from './logogo';

type IconModule = Record<string, unknown>;
let lucide: Promise<IconModule> | null = null;
let phosphor: Promise<IconModule> | null = null;

/** Renders a lucide/phosphor React icon to static SVG markup (libraries load lazily, only for migration). */
export const renderLibraryIcon: IconRenderer = async ({ library, name, color, strokeWidth, weight }) => {
  const [{ createElement }, { renderToStaticMarkup }, mod] = await Promise.all([
    import('react'),
    import('react-dom/server'),
    library === 'phosphor' ? (phosphor ??= import('@phosphor-icons/react/dist/ssr') as Promise<IconModule>) : (lucide ??= import('lucide-react') as Promise<IconModule>),
  ]);
  const Component = (mod[name] ?? mod[`${name}Icon`]) as ComponentType<Record<string, unknown>> | undefined;
  if (!Component) return null;
  const props: Record<string, unknown> =
    library === 'phosphor' ? { size: 256, color, weight: weight ?? 'regular' } : { size: 24, color, strokeWidth: strokeWidth ?? 2 };
  return renderToStaticMarkup(createElement(Component, props));
};
