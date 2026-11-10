import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { confirmPendingImport, usePendingImport } from '@/io/launch';

const countNodes = (nodes: { type: string; children?: unknown[] }[]): number =>
  nodes.reduce((n, c) => n + 1 + (c.type === 'group' ? countNodes(c.children as { type: string }[]) : 0), 0);

/** Confirmation for `#open=` / `?import=` links (src/io/launch.ts). */
export function OpenLinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pending = usePendingImport((s) => s.pending);
  const doc = pending?.doc;
  return (
    <AlertDialog
      open={open && !!pending}
      onOpenChange={(o) => {
        if (!o) usePendingImport.setState({ pending: null });
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Import “{doc?.name}” into your projects?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.source === 'svg' ? 'An SVG' : 'A Designer project'} from {pending?.from}: {doc?.artboard.width} × {doc?.artboard.height},{' '}
            {doc ? countNodes(doc.children) : 0} objects. It is added as a new project; nothing you have is changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              void confirmPendingImport();
            }}
          >
            Import
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
