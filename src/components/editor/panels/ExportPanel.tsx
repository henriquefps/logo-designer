import { useState } from 'react';
import { toast } from 'sonner';
import { DownloadSimpleIcon, CodeIcon, PackageIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCanvasRef } from '@/hooks/useCanvasRef';
import { svgToBlob, svgToBlobUrl, downloadBlob } from '@/lib/export/svgSerialize';
import { generateIconPack } from '@/lib/export/iconPack';

const SIZES = [256, 512, 1024] as const;
const RASTER_FORMATS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
  { value: 'image/jpeg', label: 'JPG' },
] as const;

export function ExportPanel() {
  const svgRef = useCanvasRef();
  const [size, setSize] = useState<number>(512);
  const [format, setFormat] = useState<(typeof RASTER_FORMATS)[number]['value']>('image/png');
  const [busy, setBusy] = useState<string | null>(null);

  const withBusy = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      console.error(error);
      toast.error('Export failed', { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const downloadRaster = () =>
    withBusy('raster', async () => {
      if (!svgRef.current) return;
      const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
      const blob = await svgToBlob(svgRef.current, size, size, format, format === 'image/png' ? undefined : 0.92);
      downloadBlob(blob, `logogo-design-${size}x${size}.${ext}`);
      toast.success(`Exported ${ext.toUpperCase()} at ${size}×${size}`);
    });

  const downloadSvg = () =>
    withBusy('svg', async () => {
      if (!svgRef.current) return;
      const { url, revoke } = svgToBlobUrl(svgRef.current);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'logogo-design.svg';
      link.click();
      revoke();
      toast.success('Exported SVG');
    });

  const downloadIconPack = () =>
    withBusy('pack', async () => {
      if (!svgRef.current) return;
      const blob = await generateIconPack(svgRef.current);
      downloadBlob(blob, 'logogo-icon-pack.zip');
      toast.success('Icon pack ready', { description: 'Web, iOS, and Android sizes included.' });
    });

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Size</Label>
        <ToggleGroup type="single" variant="outline" value={String(size)} onValueChange={(v) => v && setSize(Number(v))} className="grid grid-cols-3">
          {SIZES.map((s) => (
            <ToggleGroupItem key={s} value={String(s)} className="text-xs">
              {s}px
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Format</Label>
        <ToggleGroup type="single" variant="outline" value={format} onValueChange={(v: typeof format) => v && setFormat(v)} className="grid grid-cols-3">
          {RASTER_FORMATS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="text-xs">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" onClick={downloadRaster} disabled={busy !== null}>
          <DownloadSimpleIcon className="size-4" />
          Download {RASTER_FORMATS.find((f) => f.value === format)?.label} ({size}px)
        </Button>
        <Button type="button" variant="secondary" onClick={downloadSvg} disabled={busy !== null}>
          <CodeIcon className="size-4" />
          Download SVG
        </Button>
        <Button type="button" variant="secondary" onClick={downloadIconPack} disabled={busy !== null}>
          <PackageIcon className="size-4" />
          {busy === 'pack' ? 'Generating icon pack…' : 'Download Icon Pack (ZIP)'}
        </Button>
        <p className="text-xs text-muted-foreground">
          The icon pack bundles favicons, an iOS AppIcon set, and Android mipmaps (square + round) generated from this design.
        </p>
      </div>
    </div>
  );
}
