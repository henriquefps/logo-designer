import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { getExporters } from '@/io/exporters/registry';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';

/** Lists registered exporters (src/io/exporters/*). The export worker replaces/extends this UI. */
export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const exporters = getExporters();
  const [format, setFormat] = useState(exporters[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const current = exporters.find((e) => e.id === format);
  const run = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const selection = useEditorStore.getState().selection;
      await current.run({ doc: useDocStore.getState().doc, selection, scope: selection.length ? 'selection' : 'artboard' });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Export</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Download the artboard or the selection.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          {exporters.length === 0 ? (
            <p className="text-[0.9375rem] text-muted-foreground">SVG, PNG and JPG export are coming soon. Meanwhile, File → Save project file keeps a full copy.</p>
          ) : (
            <>
              <ToggleGroup type="single" variant="outline" value={format} onValueChange={(v) => v && setFormat(v)} aria-label="Format">
                {exporters.map((e) => (
                  <ToggleGroupItem key={e.id} value={e.id}>
                    {e.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {current?.Options && <current.Options />}
            </>
          )}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          {current && (
            <Button onClick={run} disabled={busy}>
              Export {current.label}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {current ? 'Cancel' : 'Close'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
