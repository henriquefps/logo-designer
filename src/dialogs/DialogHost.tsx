import { useEditorStore } from '@/store/useEditorStore';
import { getDialogs } from './registry';

/** Mounts every registered dialog; the one matching editor.dialog is open. */
export function DialogHost() {
  const dialog = useEditorStore((s) => s.dialog);
  const openDialog = useEditorStore((s) => s.openDialog);
  return (
    <>
      {getDialogs().map(({ id, Component }) => (
        <Component key={id} open={dialog === id} onOpenChange={(o) => openDialog(o ? id : null)} />
      ))}
    </>
  );
}
