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
import { findNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useNodeEdit } from '@/tools/direct/state';
import { confirmPendingConvert } from '@/vector/commands';

/** Asked when node editing starts on a rectangle/ellipse/polygon. */
export function ConvertToPathDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pending = useNodeEdit((s) => s.pendingConvert);
  const node = useDocStore((s) => (pending ? findNode(s.doc, pending) : null));
  const kind = node?.type === 'rect' ? 'rectangle' : node?.type === 'ellipse' ? 'ellipse' : node?.type === 'polygon' ? (node.innerRadius !== undefined ? 'star' : 'polygon') : 'shape';
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) useNodeEdit.setState({ pendingConvert: null });
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Convert {kind} to a path?</AlertDialogTitle>
          <AlertDialogDescription>
            Editing points needs a path. The {kind} keeps its look, but its shape settings (size, corner radius, sides) stop being
            editable as numbers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              confirmPendingConvert();
            }}
          >
            Convert to path
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
