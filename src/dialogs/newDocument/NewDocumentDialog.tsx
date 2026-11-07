import { useEffect, useState } from 'react';
import { FileSvgIcon, FolderOpenIcon, PlusIcon } from '@phosphor-icons/react';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { runAction } from '@/actions/registry';
import { ARTBOARD_PRESETS } from '@/panels/properties/sections/artboard/presets';
import { NumberField } from '@/panels/shared/NumberField';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { loadDocument, type ProjectMeta } from '@/store/persistence';
import { relativeDate, fullDate } from '@/lib/relativeDate';
import { cn } from '@/lib/utils';
import { isFirstVisit, markWelcomed } from './welcome';

const MAX_SIDE = 16384;

/** Proportional outline of a preset (fits a 40 × 40 box). */
function Ratio({ width, height }: { width: number; height: number }) {
  const k = 36 / Math.max(width, height);
  return (
    <span className="flex size-10 shrink-0 items-center justify-center" aria-hidden="true">
      <span className="rounded-[3px] border-2 border-current" style={{ width: Math.max(8, width * k), height: Math.max(6, height * k) }} />
    </span>
  );
}

/** Small SVG preview of a saved project (loaded lazily). */
function Thumbnail({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    void (async () => {
      const doc = await loadDocument(id);
      if (!doc || !alive) return;
      const { exportSvg } = await import('@/io/svgExport');
      const { svg } = await exportSvg(doc);
      if (!alive) return;
      objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      setUrl(objectUrl);
    })().catch(() => null);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return (
    <span
      className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border bg-muted p-2"
      aria-hidden="true"
    >
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain shadow-xs" draggable={false} />}
    </span>
  );
}

/**
 * Welcome / File → New: size presets (or a custom size), recent projects and Open SVG. The
 * first visit shows it once; a still-empty document is reused instead of creating another one.
 */
export function NewDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const activeId = useProjectsStore((s) => s.activeId);
  const [custom, setCustom] = useState({ width: 800, height: 600 });
  const [busy, setBusy] = useState(false);
  const welcome = isFirstVisit();
  const recent = [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);

  const close = (o: boolean) => {
    if (!o) markWelcomed();
    onOpenChange(o);
  };

  const createSized = async (width: number, height: number) => {
    setBusy(true);
    try {
      const ds = useDocStore.getState();
      const pristine = ds.doc.children.length === 0 && ds.past.length === 0 && ds.future.length === 0;
      if (pristine) {
        // The empty document opened on first visit: just size it (no extra empty project).
        ds.load({ ...ds.doc, artboard: { ...ds.doc.artboard, width, height }, updatedAt: Date.now() });
        useEditorStore.getState().fitRect({ x: 0, y: 0, width, height });
        await useProjectsStore.getState().flush();
      } else {
        await useProjectsStore.getState().create('Untitled', { width, height });
      }
      close(false);
    } finally {
      setBusy(false);
    }
  };

  const openRecent = async (p: ProjectMeta) => {
    await useProjectsStore.getState().open(p.id);
    close(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={close}>
      <ResponsiveDialogContent className="sm:max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{welcome ? 'Welcome to Designer' : 'New document'}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {welcome
              ? 'A free SVG editor that runs entirely in your browser. Pick a size to start; you can change it later.'
              : 'Pick a size for the artboard. You can change it later in Properties.'}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-5">
          <section className="flex flex-col gap-2" aria-label="Sizes">
            <h3 className="eyebrow">Sizes</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ARTBOARD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void createSized(p.width, p.height)}
                  className="flex min-h-14 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  <Ratio width={p.width} height={p.height} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{p.label}</span>
                    <span className="text-xs tabular-nums">
                      {p.width} × {p.height}
                    </span>
                  </span>
                </button>
              ))}
              <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 sm:col-span-3">
                <span className="text-sm font-medium">Custom</span>
                <NumberField className="w-28" label="W" ariaLabel="Custom width" value={custom.width} min={1} max={MAX_SIDE} precision={0} onCommit={(width) => setCustom((c) => ({ ...c, width }))} />
                <NumberField className="w-28" label="H" ariaLabel="Custom height" value={custom.height} min={1} max={MAX_SIDE} precision={0} onCommit={(height) => setCustom((c) => ({ ...c, height }))} />
                <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => void createSized(Math.round(custom.width), Math.round(custom.height))}>
                  <PlusIcon data-icon="inline-start" />
                  Create
                </Button>
              </div>
            </div>
          </section>
          {recent.length > 0 && !welcome && (
            <section className="flex flex-col gap-2" aria-label="Recent projects">
              <h3 className="eyebrow">Recent</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {recent.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void openRecent(p)}
                    className={cn(
                      'flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
                      p.id === activeId && 'bg-muted hover:bg-muted',
                    )}
                  >
                    <Thumbnail id={p.id} />
                    <span className="truncate px-0.5 text-sm font-medium">{p.name}</span>
                    <span className="px-0.5 text-xs text-muted-foreground" title={fullDate(p.updatedAt)}>
                      {relativeDate(p.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              close(false);
              runAction('file.openSvg');
            }}
          >
            <FileSvgIcon data-icon="inline-start" />
            Open SVG…
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              close(false);
              runAction('file.projects');
            }}
          >
            <FolderOpenIcon data-icon="inline-start" />
            All projects
          </Button>
          <Button variant="ghost" onClick={() => close(false)}>
            {welcome ? 'Start with 1024 × 1024' : 'Cancel'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
