import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
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
import { safeFileName } from '@/io/download';
import { copyText, downloadExport, renderExport, type ExportFormat, type ExportSettings } from '@/io/exportActions';
import { getExporters } from '@/io/exporters/registry';
import { formatBytes, rasterSize } from '@/io/rasterExport';
import { exportArea } from '@/io/svgExport';
import { useDocStore } from '@/store/useDocStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { platformDef, screenNodes, skippedReferenceNodes, skippedReferenceNotice, type ScreenNode } from '@/model';
import { frameOf } from '@/wireframe/screens';
import { useEditorStore } from '@/store/useEditorStore';

/** `settings.phone`: the file name of a screen export (same as the AI export package). */
const screenFileName = (f: ScreenNode) => `${safeFileName(f.name)}.${f.screen.platform}`;

const BUILT_IN: { id: ExportFormat; label: string }[] = [
  { id: 'svg', label: 'SVG' },
  { id: 'png', label: 'PNG' },
  { id: 'jpg', label: 'JPG' },
];
const SCALES = ['1', '2', '4', 'custom'] as const;

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
      <Label htmlFor={htmlFor} className="text-sm font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** File → Export: SVG / PNG / JPG (+ any registered exporter), artboard or selection, live preview. */
export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const doc = useDocStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const extra = getExporters().filter((e) => !e.when || e.when(doc));
  const [format, setFormat] = useState<string>('svg');
  const [scope, setScope] = useState<'artboard' | 'selection' | 'screen'>('artboard');
  const [screenId, setScreenId] = useState<string>('');
  const frames = useMemo(() => screenNodes(doc), [doc]);
  const [scaleChoice, setScaleChoice] = useState<(typeof SCALES)[number]>('2');
  const [customWidth, setCustomWidth] = useState(1024);
  const [quality, setQuality] = useState(0.9);
  const [padding, setPadding] = useState(0);
  const [background, setBackground] = useState(true);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; bytes: number; width: number; height: number; svg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);

  // Defaults each time the dialog opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFilename(safeFileName(doc.name));
      setScope(selection.length ? 'selection' : 'artboard');
      if (doc.wireframe) {
        // Wireframes export one screen by default: the selected one (or the one holding the selection).
        const frame = selection.map((id) => frameOf(doc, id)).find(Boolean) ?? frames[0];
        if (frame) {
          setScreenId(frame.id);
          setScope(selection.length === 1 && selection[0] !== frame.id ? 'selection' : 'screen');
          setFilename(screenFileName(frame));
        }
      }
    } else setPreview(null);
  }

  const builtIn = BUILT_IN.some((f) => f.id === format);
  const customExporter = builtIn ? null : extra.find((e) => e.id === format) ?? null;
  const raster = format === 'png' || format === 'jpg';
  const screenExists = frames.some((f) => f.id === screenId);
  const effectiveScope = (scope === 'selection' && selection.length === 0) || (scope === 'screen' && !screenExists) ? 'artboard' : scope;

  const settings = useMemo<ExportSettings | null>(
    () =>
      builtIn
        ? {
            format: format as ExportFormat,
            scope: effectiveScope,
            selection,
            screenId,
            padding,
            background,
            scale: scaleChoice === 'custom' ? 1 : Number(scaleChoice),
            customWidth: scaleChoice === 'custom' ? customWidth : undefined,
            quality,
          }
        : null,
    [builtIn, format, effectiveScope, selection, screenId, padding, background, scaleChoice, customWidth, quality],
  );

  const area = useMemo(() => exportArea(doc, { scope: effectiveScope, selection, screenId, padding }), [doc, effectiveScope, selection, screenId, padding]);
  const referenceNotice = useMemo(
    () => skippedReferenceNotice(skippedReferenceNodes(doc, effectiveScope === 'selection' ? selection : effectiveScope === 'screen' ? [screenId] : undefined)),
    [doc, effectiveScope, selection, screenId],
  );
  const pixelSize = area && raster ? rasterSize(area, { scale: settings?.scale, width: settings?.customWidth }) : null;

  // Live preview (debounced): the actual output file.
  useEffect(() => {
    if (!open || !settings) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const out = await renderExport(doc, settings);
        if (cancelled) return;
        const url = URL.createObjectURL(out.blob);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview({ url, bytes: out.blob.size, width: out.width, height: out.height, svg: out.svg });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Preview failed.');
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, doc, settings]);

  useEffect(() => {
    if (open || !previewUrl.current) return;
    URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  }, [open]);

  const run = async () => {
    setBusy(true);
    try {
      if (settings) {
        await downloadExport(doc, settings, filename || doc.name);
      } else if (customExporter) {
        await customExporter.run(
          effectiveScope === 'screen' ? { doc, selection: [screenId], scope: 'selection' } : { doc, selection, scope: effectiveScope },
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const copySvg = async () => {
    if (!preview) return;
    if (await copyText(preview.svg)) toast.success('SVG copied to the clipboard');
    else toast.error('The clipboard is not available here.');
  };

  const sizeLabel = preview
    ? `${raster ? `${preview.width} × ${preview.height} px` : `${Math.round(preview.width * 100) / 100} × ${Math.round(preview.height * 100) / 100}`} · ${formatBytes(preview.bytes)}`
    : pixelSize
      ? `${pixelSize.width} × ${pixelSize.height} px`
      : '';

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Export</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {doc.wireframe ? 'Download a screen, the selection or every screen as an image file.' : 'Download the artboard or the selection as an image file.'}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          <div
            className="flex h-48 items-center justify-center overflow-hidden rounded-lg border bg-muted p-3"
            style={{
              backgroundImage:
                'linear-gradient(45deg, var(--border) 25%, transparent 25%), linear-gradient(-45deg, var(--border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--border) 75%), linear-gradient(-45deg, transparent 75%, var(--border) 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            }}
          >
            {customExporter ? (
              <span className="text-sm text-muted-foreground">No preview for this format</span>
            ) : preview ? (
              <img src={preview.url} alt="Export preview" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-sm text-muted-foreground">{error ?? 'Rendering preview…'}</span>
            )}
          </div>
          {referenceNotice && (
            <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[0.8125rem]">
              {referenceNotice}
            </p>
          )}
          <p className="-mt-2 text-[0.8125rem] text-muted-foreground tabular-nums" aria-live="polite">
            {error ? error : sizeLabel}
          </p>

          <Field label="Format">
            <ToggleGroup type="single" variant="outline" value={format} onValueChange={(v) => v && setFormat(v)} aria-label="Format">
              {BUILT_IN.map((f) => (
                <ToggleGroupItem key={f.id} value={f.id} className="px-3">
                  {f.label}
                </ToggleGroupItem>
              ))}
              {extra.map((e) => (
                <ToggleGroupItem key={e.id} value={e.id} className="px-3">
                  {e.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field label="Area">
            <ToggleGroup type="single" variant="outline" value={effectiveScope} onValueChange={(v) => v && setScope(v as typeof scope)} aria-label="Area">
              {doc.wireframe && (
                <ToggleGroupItem value="screen" disabled={frames.length === 0} className="px-3">
                  Screen
                </ToggleGroupItem>
              )}
              <ToggleGroupItem value="artboard" className="px-3">
                {doc.wireframe ? 'All' : 'Artboard'}
              </ToggleGroupItem>
              <ToggleGroupItem value="selection" disabled={selection.length === 0} className="px-3">
                Selection
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          {effectiveScope === 'screen' && (
            <Field label="Screen">
              <Select
                value={screenId}
                onValueChange={(id) => {
                  setScreenId(id);
                  const f = frames.find((x) => x.id === id);
                  if (f) setFilename(screenFileName(f));
                }}
              >
                <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Screen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {frames.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} · {platformDef(f.screen.platform).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {effectiveScope === 'selection' ? (
            <Field label="Padding" htmlFor="export-padding">
              <Input
                id="export-padding"
                type="number"
                min={0}
                value={padding}
                onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">px</span>
            </Field>
          ) : (
            builtIn &&
            !doc.wireframe && (
              <Field label="Background" htmlFor="export-bg">
                <Switch id="export-bg" checked={background} onCheckedChange={setBackground} disabled={doc.artboard.background.kind === 'none'} />
                <span className="text-sm text-muted-foreground">
                  {doc.artboard.background.kind === 'none'
                    ? 'Artboard is transparent'
                    : background
                      ? 'Artboard background'
                      : format === 'jpg'
                        ? 'White (JPG has no transparency)'
                        : 'Transparent'}
                </span>
              </Field>
            )
          )}

          {raster && (
            <Field label="Size">
              <ToggleGroup type="single" variant="outline" value={scaleChoice} onValueChange={(v) => v && setScaleChoice(v as typeof scaleChoice)} aria-label="Scale">
                {SCALES.map((s) => (
                  <ToggleGroupItem key={s} value={s} className="px-3">
                    {s === 'custom' ? 'Width' : `${s}×`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {scaleChoice === 'custom' && (
                <Input
                  aria-label="Width in pixels"
                  type="number"
                  min={1}
                  max={16384}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Math.max(1, Math.min(16384, Math.round(Number(e.target.value) || 1))))}
                  className="w-24"
                />
              )}
            </Field>
          )}

          {format === 'jpg' && (
            <Field label="Quality">
              <Slider value={[Math.round(quality * 100)]} min={10} max={100} step={1} onValueChange={([v]) => setQuality(v / 100)} aria-label="JPG quality" />
              <span className="w-10 text-right text-sm tabular-nums">{Math.round(quality * 100)}</span>
            </Field>
          )}

          {customExporter?.Options && <customExporter.Options />}

          {builtIn && (
            <Field label="File name" htmlFor="export-name">
              <Input id="export-name" value={filename} onChange={(e) => setFilename(e.target.value)} className="min-w-0 flex-1" />
              <span className="text-sm text-muted-foreground">.{format}</span>
            </Field>
          )}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button onClick={run} disabled={busy || (!!settings && !area)}>
            <DownloadSimpleIcon data-icon="inline-start" />
            Download
          </Button>
          {builtIn && (
            <Button variant="outline" onClick={copySvg} disabled={!preview}>
              <CopyIcon data-icon="inline-start" />
              Copy SVG
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
