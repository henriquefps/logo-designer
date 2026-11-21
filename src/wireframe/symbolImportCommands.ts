// Import components for the app (docs/wireframe-mode.md → Kits, import and paste): the Library panel's
// "Import from project…" dialog, the toasts, the sources it lists (component kits first: bundled kit samples and
// projects marked "Use as component kit", then the other local projects that have shared components) and the kit
// toggle. Document logic: ./symbolImport.ts (pure).
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

/** A place to import shared components from: a bundled kit sample or a local project (synced ones included). */
export interface ImportSourceRef {
  kind: 'sample' | 'project';
  /** Sample id or project id. */
  id: string;
  name: string;
  /** A component kit: a sample flagged `kit`, or a project with `wireframe.kit`. Kits are listed first. */
  kit: boolean;
}

/** The value a source is chosen by in a select ("sample:<id>" / "project:<id>"). */
export const sourceKey = (r: Pick<ImportSourceRef, 'kind' | 'id'>) => `${r.kind}:${r.id}`;

/** Loads a source; null when it cannot be read. The open project is read from the editor (unsaved edits included). */
export async function loadImportSource(ref: Pick<ImportSourceRef, 'kind' | 'id'>): Promise<DesignDocument | null> {
  try {
    if (ref.kind === 'sample') {
      const sample = kitSamples().find((s) => s.id === ref.id);
      return sample ? await loadSample(sample) : null;
    }
    if (ref.id === useProjectsStore.getState().activeId) return useDocStore.getState().doc;
    return await loadDocument(ref.id);
  } catch {
    return null;
  }
}

/** Resolves a `sourceKey`; null when it names nothing that can be read. */
export async function loadSourceByKey(key: string): Promise<DesignDocument | null> {
  const i = key.indexOf(':');
  const kind = key.slice(0, i);
  if (i < 0 || (kind !== 'sample' && kind !== 'project')) return null;
  return loadImportSource({ kind, id: key.slice(i + 1) });
}

/**
 * The sources that have shared components: kits first (kit samples, then kit projects), then the other local
 * projects, newest first. Each project is read once. `kitsOnly`: just the kits (New document); `excludeActive`:
 * leave out the open project (it cannot import from itself).
 */
export async function componentSources(opts: { kitsOnly?: boolean; excludeActive?: boolean } = {}): Promise<ImportSourceRef[]> {
  const { projects, activeId } = useProjectsStore.getState();
  const read = await Promise.all(
    projects
      .filter((p) => !(opts.excludeActive && p.id === activeId))
      .map(async (p) => ({ p, doc: await loadImportSource({ kind: 'project', id: p.id }) })),
  );
  const local = read
    .filter(({ doc }) => doc?.wireframe?.symbols?.length)
    .map(({ p, doc }): ImportSourceRef => ({ kind: 'project', id: p.id, name: doc!.name || p.name, kit: !!doc!.wireframe!.kit }));
  const samples = kitSamples().map((s): ImportSourceRef => ({ kind: 'sample', id: s.id, name: s.name, kit: true }));
  const kits = [...samples, ...local.filter((r) => r.kit)];
  return opts.kitsOnly ? kits : [...kits, ...local.filter((r) => !r.kit)];
}

/** Properties → Project → "Use as component kit": sets or clears `wireframe.kit` (one undo step). */
export function setKitCommand(on: boolean) {
  const ds = useDocStore.getState();
  if (!ds.doc.wireframe || !!ds.doc.wireframe.kit === on) return;
  ds.apply(
    (d) => {
      if (on) d.wireframe!.kit = true;
      else delete d.wireframe!.kit;
    },
    { label: on ? 'Use as component kit' : 'Stop using as component kit' },
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The toast of an import. The title counts every component the import brought in or matched, which is the
 * number the dialog's button showed (the ticked ones plus the ones they nest); the description breaks it down.
 * `picked`: how many were ticked (the rest came along because a ticked one uses them).
 */
export function importSummary(plan: SymbolImport, picked?: number): { title: string; description?: string } {
  const total = plan.added.length + plan.reused.length;
  const parts: string[] = [];
  const along = picked === undefined ? 0 : Math.max(0, total - picked);
  if (along) parts.push(`${along} came along because others use ${along === 1 ? 'it' : 'them'}`);
  if (plan.added.length && plan.reused.length) parts.push(`${plan.added.length} new, ${plan.reused.length} already in this project (reused)`);
  if (plan.droppedFlows) parts.push(`${plural(plan.droppedFlows, 'link')} left out: no screen of that name here`);
  if (!plan.added.length) {
    const title = 'Nothing new to import';
    const all = total === 1 ? 'It is already in this project.' : `All ${total} are already in this project.`;
    return total ? { title, description: all } : { title };
  }
  const title = `Imported ${plural(total, 'component')}`;
  return parts.length ? { title, description: parts.join('; ') + '.' } : { title };
}

/** Imports `ids` (default: all) of `source` into the open wireframe: one undo step, with a toast. */
export function importComponentsCommand(source: SymbolSource, ids?: readonly Id[]): SymbolImport | null {
  if (!useDocStore.getState().doc.wireframe) return null;
  let plan: SymbolImport | null = null;
  useDocStore.getState().apply((d) => void (plan = importSymbols(d, source, { ids })), { label: 'Import components' });
  if (plan) {
    const s = importSummary(plan, ids?.length);
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
