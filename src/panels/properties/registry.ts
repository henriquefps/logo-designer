import type { PropertySection } from './types';

const modules = import.meta.glob<{ default: PropertySection }>('./sections/*/index.{ts,tsx}', { eager: true });

const sections: PropertySection[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.order - b.order);

export const getPropertySections = () => sections;
