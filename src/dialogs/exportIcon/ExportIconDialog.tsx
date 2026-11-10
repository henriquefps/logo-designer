import { useState } from 'react';
import { CopyIcon, DownloadSimpleIcon, FileSvgIcon, FileZipIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
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
import { copyText } from '@/io/exportActions';
import { downloadGlyph, downloadIconZip } from '@/iconMode/commands';
import { glyphFragment } from '@/iconMode/glyph';
import { useIconStore } from '@/iconMode/store';
import { IconPreview } from '@/iconMode/ui/IconPreview';
import { useIconSources } from '@/iconMode/hooks';
import { useDocStore } from '@/store/useDocStore';

/** File → Export icon: glyph.svg for build-icons.mjs, or the whole icon set as a ZIP, with the review sheet live. */
export function ExportIconDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const doc = useDocStore((s) => s.doc);
  const analysis = useIconStore((s) => s.analysis);
  const sources = useIconSources(doc);
  const [busy, setBusy] = useState<null | 'zip' | 'glyph'>(null);

  const run = async (kind: 'zip' | 'glyph') => {
    setBusy(kind);
    try {
      if (kind === 'glyph') {
        await downloadGlyph(doc);
      } else {
        const r = await downloadIconZip(doc);
        toast.success(`Icon set ready: ${r.files.length} files`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    const glyph = await glyphFragment(doc);
    if (!glyph) toast.error('The glyph is empty.');
    else if (await copyText(glyph)) toast.success('Glyph SVG copied');
    else toast.error('The clipboard is not available here.');
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Export icon</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            The same files build-icons.mjs writes: docs, web, Android and iOS icons from one glyph, fitted to its keyline.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          {!doc.icon ? (
            <p className="text-sm text-muted-foreground">This is not an app icon document. Use File → Make this an app icon document first.</p>
          ) : sources && analysis.report ? (
            <>
              <IconPreview sources={sources} />
              <pre className="shrink-0 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs leading-5 whitespace-pre" aria-label="Measured">
                {analysis.report.lines.join('\n')}
              </pre>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{analysis.status === 'empty' ? 'The glyph is empty: draw something first.' : 'Measuring the glyph…'}</p>
          )}
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Glyph SVG</span>: a 128 × 128 fragment in currentColor for <code className="font-mono text-xs">build-icons.mjs</code> (plus glyph-small.svg when a favicon glyph is linked).
            </li>
            <li>
              <span className="font-medium text-foreground">Icon set</span>: docs-img/, site/, android/res/, ios/, review-sheet.png, README.txt, glyph.svg and the project file.
            </li>
          </ul>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button onClick={() => void run('zip')} disabled={!!busy || !sources}>
            {busy === 'zip' ? <DownloadSimpleIcon data-icon="inline-start" /> : <FileZipIcon data-icon="inline-start" />}
            {busy === 'zip' ? 'Building…' : 'Icon set (ZIP)'}
          </Button>
          <Button variant="outline" onClick={() => void run('glyph')} disabled={!!busy || !sources}>
            <FileSvgIcon data-icon="inline-start" />
            Glyph SVG
          </Button>
          <Button variant="outline" onClick={() => void copy()} disabled={!sources}>
            <CopyIcon data-icon="inline-start" />
            Copy glyph
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
