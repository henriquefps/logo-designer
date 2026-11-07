import type { Exporter } from './types';

const modules = import.meta.glob<{ default: Exporter }>('./*/index.{ts,tsx}', { eager: true });

const exporters: Exporter[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

export const getExporters = () => exporters;
