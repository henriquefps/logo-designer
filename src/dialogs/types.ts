import type { ComponentType } from 'react';

/**
 * A dialog opened with useEditorStore.getState().openDialog(id). Put each in
 * `src/dialogs/<id>/index.ts` with `default: DialogDef`. The component gets `open`/`onOpenChange`.
 */
export interface DialogDef {
  id: string;
  Component: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void }>;
}
