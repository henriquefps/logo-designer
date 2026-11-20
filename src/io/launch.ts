// Handles `#open=` / `?import=` page URLs (see shareLink.ts): resolve the payload, ask for
// confirmation in the `openLink` dialog, then add it as a new project (never overwrites).
import { toast } from 'sonner';
import { create } from 'zustand';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { readLaunchRequest, resolveLaunchRequest, withoutLaunchRequest, type SharedDocument } from './shareLink';

export interface PendingImport extends SharedDocument {
  /** Where it came from, for the dialog ("a shared link" or host/path). */
  from: string;
}

export const usePendingImport = create<{ pending: PendingImport | null }>()(() => ({ pending: null }));

/**
 * Looks at the current URL; when it carries an open/import request, removes it from the address
 * bar (a reload must not import again), resolves it and opens the confirm dialog.
 * Returns true when a request was found.
 */
export function handleLaunchUrl(): boolean {
  const req = readLaunchRequest(location.href);
  if (!req) return false;
  history.replaceState(history.state, '', withoutLaunchRequest(location.href));
  const loading = req.kind === 'url' ? toast.loading('Downloading…') : undefined;
  void resolveLaunchRequest(req)
    .then((shared) => {
      usePendingImport.setState({ pending: shared });
      useEditorStore.getState().openDialog('openLink');
    })
    .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not open this link.', { duration: 10000 }))
    .finally(() => loading !== undefined && toast.dismiss(loading));
  return true;
}

/** Confirmed in the dialog: add as a new project and open it. */
export async function confirmPendingImport() {
  const p = usePendingImport.getState().pending;
  usePendingImport.setState({ pending: null });
  if (!p) return;
  await useProjectsStore.getState().importDocument(p.doc);
  for (const w of p.warnings) toast.warning(w);
  toast.success(`Imported “${p.doc.name}”`);
}

/**
 * `?open-project=<id>` (printed by `designer live`): opens a synced project once this device has it.
 * Waits up to two minutes for the sync to bring it; does nothing visible when Sync is off but say so.
 */
export function handleOpenProjectUrl(syncConfigured: boolean): boolean {
  const url = new URL(location.href);
  const id = url.searchParams.get('open-project');
  if (!id) return false;
  url.searchParams.delete('open-project');
  history.replaceState(history.state, '', url.toString());
  const projects = useProjectsStore;
  const has = () => projects.getState().projects.some((p) => p.id === id);
  if (has()) {
    void projects.getState().open(id);
    return true;
  }
  if (!syncConfigured) {
    toast.error('This link opens a synced project. Turn on Sync (File → Sync…) with the same server as the CLI, then open it again.', { duration: 15000 });
    return true;
  }
  const waiting = toast.loading('Waiting for the project to sync…');
  const done = () => {
    clearTimeout(timeout);
    unsub();
    toast.dismiss(waiting);
  };
  const unsub = projects.subscribe(() => {
    if (!has()) return;
    done();
    void projects.getState().open(id);
  });
  const timeout = setTimeout(() => {
    done();
    toast.error('The project did not arrive from the sync server. Is `designer live` still running against the same server?', { duration: 15000 });
  }, 120_000);
  return true;
}
