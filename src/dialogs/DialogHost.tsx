import { Suspense, useState } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { getDialogs } from './registry';

/**
 * Mounts registered dialogs lazily: each dialog's code loads the first time it opens and then
 * stays mounted (so its close animation can run). The one matching editor.dialog is open.
 */
export function DialogHost() {
  const dialog = useEditorStore((s) => s.dialog);
  const openDialog = useEditorStore((s) => s.openDialog);
  const [mounted, setMounted] = useState<string[]>([]);
  if (dialog && !mounted.includes(dialog)) setMounted([...mounted, dialog]);
  return (
    <>
      {getDialogs()
        .filter(({ id }) => mounted.includes(id) || dialog === id)
        .map(({ id, Component }) => (
          <Suspense key={id} fallback={null}>
            <Component open={dialog === id} onOpenChange={(o) => openDialog(o ? id : null)} />
          </Suspense>
        ))}
    </>
  );
}
