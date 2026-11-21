// Import components for the app (docs/wireframe-mode.md → Kits, import and paste): the Library panel's
// "Import from project…" dialog, the toasts, and the sources it lists (component kits first, then the
// local projects that have shared components). Document logic: ./symbolImport.ts (pure).
import { toast } from 'sonner';
import type { DesignDocument, Id } from '@/model';
import { loadDocument } from '@/store/persistence';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { lastPasteImport } from '@/store/clipboard';
import { loadSample } from '@/samples/open';
import { kitSamples } from '@/samples/registry';
import { importSymbols, type SymbolImport, type SymbolSource } from './symbolImport';

export const IMPORT_COMPONENTS_DIALOG = 'importComponents';

export const startImportComponents = () => useEditorStore.getState().openDialog(IMPORT_COMPONENTS_DIALOG);

/** A place to import shared components from. */
export interface ImportSourceRef {
  kind: 'kit' | 'project';
  /** Sample id or project id. */
  id: string;
  name: string;
}

/** Kits (bundled samples flagged `kit`) first, then the other local projects (newest first). Projects are not loaded here. */
export function importSourceRefs(): ImportSourceRef[] {
  const { projects, activeId } = useProjectsStore.getState();
  return [
    ...kitSamples().map((s) => ({ kind: 'kit' as const, id: s.id, name: s.name })),
    ...projects.filter((p) => p.id !== activeId).map((p) => ({ kind: 'project' as const, id: p.id, name: p.name })),
  ];
}

/** Loads a source; null when it cannot be read. */
export async function loadImportSource(ref: ImportSourceRef): Promise<DesignDocument | null> {
  try {
    if (ref.kind === 'kit') {
      const sample = kitSamples().find((s) => s.id === ref.id);
      return sample ? await loadSample(sample) : null;
    }
    return await loadDocument(ref.id);
  } catch {
    return null;
  }
}

/** The local projects (not the open one) that have shared components, loaded; kits are listed whether or not they load. */
export async function projectsWithComponents(refs: readonly ImportSourceRef[]): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    refs
      .filter((r) => r.kind === 'project')
      .map(async (r) => {
        const doc = await loadImportSource(r);
        if (doc?.wireframe?.symbols?.length) out.add(r.id);
      }),
  );
  return out;
}

/** "Imported 3 components" (+ reused, + dropped links). */
export function importSummary(plan: SymbolImport): { title: string; description?: string } {
  const n = plan.added.length;
  const title = n ? `Imported ${n} component${n === 1 ? '' : 's'}` : 'Nothing new to import';
  const parts: string[] = [];
  if (plan.reused.length) parts.push(`${plan.reused.length} already in this project (reused)`);
  if (plan.droppedFlows) parts.push(`${plan.droppedFlows} link${plan.droppedFlows === 1 ? '' : 's'} left out: no screen of that name here`);
  return parts.length ? { title, description: parts.join('; ') + '.' } : { title };
}

/** Imports `ids` (default: all) of `source` into the open wireframe: one undo step, with a toast. */
export function importComponentsCommand(source: SymbolSource, ids?: readonly Id[]): SymbolImport | null {
  if (!useDocStore.getState().doc.wireframe) return null;
  let plan: SymbolImport | null = null;
  useDocStore.getState().apply((d) => void (plan = importSymbols(d, source, { ids })), { label: 'Import components' });
  if (plan) {
    const s = importSummary(plan);
    toast.success(s.title, s.description ? { description: s.description } : undefined);
  }
  return plan;
}

/** After a paste: says which shared components came along (pasted from another document). */
export function notifyPasteImport() {
  const plan = lastPasteImport();
  if (!plan?.added.length) return;
  const names = plan.added.map((s) => `“${s.name}”`).join(', ');
  toast.success(`Added ${plan.added.length} shared component${plan.added.length === 1 ? '' : 's'}`, { description: `${names}, from the document you copied from.` });
}
