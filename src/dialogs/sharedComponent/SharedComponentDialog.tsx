// Shared components (src/wireframe/symbolCommands.ts): the name prompt of Make component and Rename, and
// the confirmation before deleting a master that has instances.
import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { deleteSymbolCommand, makeComponentCommand, renameSymbolCommand, useSymbolDialog, type SymbolDialogState } from '@/wireframe/symbolCommands';

function NameForm({ state, close }: { state: Extract<NonNullable<SymbolDialogState>, { mode: 'make' | 'rename' }>; close: () => void }) {
  const [name, setName] = useState(state.name);
  const make = state.mode === 'make';
  const submit = () => {
    const label = name.trim();
    if (!label) return;
    if (state.mode === 'make') makeComponentCommand(state.nodeId, label);
    else renameSymbolCommand(state.symbolId, label);
    close();
  };
  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{make ? 'Make component' : 'Rename component'}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {make
            ? 'The selection becomes a shared component: insert it on other screens from My components in the library. Editing any instance updates all of them.'
            : 'The name shows in My components and in the export for AI.'}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody className="flex flex-col gap-2">
        <Label htmlFor="shared-component-name">Name</Label>
        <Input id="shared-component-name" value={name} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setName(e.target.value)} placeholder="Trip card" />
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {make ? 'Make component' : 'Rename'}
        </Button>
      </ResponsiveDialogFooter>
    </form>
  );
}

export function SharedComponentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const state = useSymbolDialog((s) => s.state);
  const close = () => {
    onOpenChange(false);
    useSymbolDialog.setState({ state: null });
  };
  if (state?.mode === 'delete') {
    return (
      <AlertDialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{state.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {state.instances === 1 ? 'Its one instance stays' : `Its ${state.instances} instances stay`} on the screens as plain content, no longer linked. The component
              leaves My components.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteSymbolCommand(state.symbolId);
                close();
              }}
            >
              Delete component
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  return (
    <ResponsiveDialog open={open && !!state} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <ResponsiveDialogContent className="sm:max-w-md">
        {state && <NameForm key={`${state.mode}:${'nodeId' in state ? state.nodeId : state.symbolId}`} state={state} close={close} />}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
