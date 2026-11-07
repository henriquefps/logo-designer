import type { Importer } from './types';

const modules = import.meta.glob<{ default: Importer }>('./*/index.{ts,tsx}', { eager: true });

const importers: Importer[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean);

export const getImporters = () => importers;
export const getImporter = (id: string) => importers.find((i) => i.id === id);

/** First importer accepting a file (by extension or MIME type). */
export function importerForFile(file: File): Importer | undefined {
  const name = file.name.toLowerCase();
  return importers.find((imp) =>
    imp.accept.split(',').some((a) => {
      const t = a.trim().toLowerCase();
      if (t.startsWith('.')) return name.endsWith(t);
      if (t.endsWith('/*')) return file.type.startsWith(t.slice(0, -1));
      return file.type === t;
    }),
  );
}
