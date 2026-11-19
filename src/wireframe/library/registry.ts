import type { AnyComponentDef } from './types';

// Every component kind lives in `src/wireframe/library/<kind>/index.ts` with `export default
// defineComponent({...})`. Discovered at build time (and by the CLI's glob plugin), so adding a
// component never touches a shared file.
const modules = import.meta.glob<{ default: AnyComponentDef }>('./*/index.{ts,tsx}', { eager: true });

const defs: AnyComponentDef[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

const byKind = new Map(defs.map((d) => [d.kind, d]));

export const getComponents = (): AnyComponentDef[] => defs;
export const getComponent = (kind: string): AnyComponentDef | undefined => byKind.get(kind);
export const isComponentKind = (kind: string): boolean => byKind.has(kind);
