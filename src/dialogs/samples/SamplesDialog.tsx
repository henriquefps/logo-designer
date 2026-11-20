// Help → Open sample project…: every sample in the registry; opening one makes a new project copy.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { modeDef } from '@/dialogs/newDocument/modes';
import { SAMPLES, type SampleDef } from '@/samples/registry';
import { SampleCard } from '@/samples/SampleCard';
import { openSampleWithToast } from '@/samples/ui';

export function SamplesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const pick = async (s: SampleDef) => {
    setBusy(true);
    try {
      if (await openSampleWithToast(s)) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Open sample project</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Each sample opens as a new project of yours: change it freely, the sample stays as it is.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-2">
          {SAMPLES.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5">
              <span className="eyebrow">{modeDef(s.mode).label}</span>
              <SampleCard sample={s} onOpen={(x) => void pick(x)} disabled={busy} />
            </div>
          ))}
          {SAMPLES.length === 0 && <p className="text-sm text-muted-foreground">No samples in this build.</p>}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
