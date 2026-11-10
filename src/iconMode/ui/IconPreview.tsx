import { useMemo } from 'react';
import { faviconSvg, maskedSvg, SHEET, type IconSources, type MaskId } from '@/icon';
import { cn } from '@/lib/utils';
import { useIconStore } from '../store';

const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const MASKS: { id: MaskId; label: string }[] = [
  { id: 'squircle', label: 'Squircle' },
  { id: 'circle', label: 'Circle' },
  { id: 'rounded', label: 'Rounded square' },
];

/**
 * The script's review sheet, live: masks at 128 with the 0.63 T reference circle, launcher sizes
 * on a dark home screen, favicons on dark and white. `compact` scales row 1 to the panel width.
 */
export function IconPreview({ sources, compact = false }: { sources: IconSources; compact?: boolean }) {
  const light = useIconStore((s) => s.light);
  const urls = useMemo(() => {
    const masks = MASKS.map((m) => ({ ...m, url: dataUrl(maskedSvg(sources, m.id, true, { light })) }));
    return { masks, launcher: dataUrl(maskedSvg(sources, 'squircle', false, { light })), favicon: dataUrl(faviconSvg(sources)) };
  }, [sources, light]);
  return (
    <div className="flex shrink-0 flex-col gap-2" aria-label="Icon preview">
      <div className={cn('grid grid-cols-3 gap-2', !compact && 'w-fit')}>
        {urls.masks.map((m) => (
          <img key={m.id} src={m.url} alt={`${m.label} mask`} title={`${m.label} mask, pink circle = 0.63 T`} width={128} height={128} className={cn(compact ? 'h-auto w-full' : 'size-32')} draggable={false} />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-md p-3" style={{ background: SHEET.background }} title="Launcher sizes on a dark home screen">
        {[48, 56, 64, 96].map((s) => (
          <img key={s} src={urls.launcher} alt={`${s} px launcher icon`} width={s} height={s} style={{ width: s, height: s }} draggable={false} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-end gap-2 rounded-md p-2" style={{ background: SHEET.background }} title="Favicons on dark">
          {[16, 32, 48].map((s) => (
            <img key={s} src={urls.favicon} alt={`${s} px favicon on dark`} width={s} height={s} style={{ width: s, height: s }} draggable={false} />
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-md border p-2" style={{ background: "#fff" }} title="Favicons on white">
          {[16, 32, 48].map((s) => (
            <img key={s} src={urls.favicon} alt={`${s} px favicon on white`} width={s} height={s} style={{ width: s, height: s }} draggable={false} />
          ))}
        </div>
      </div>
    </div>
  );
}
