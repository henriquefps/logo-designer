import type { AssetSource } from './types';

const modules = import.meta.glob<{ default: AssetSource }>('./sources/*/index.{ts,tsx}', { eager: true });

const sources: AssetSource[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.order - b.order);

export const getAssetSources = () => sources;
