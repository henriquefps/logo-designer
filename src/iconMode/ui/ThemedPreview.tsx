import { useMemo } from 'react';
import type { IconSources } from '@/icon';
import { ColorField } from '@/panels/shared/ColorField';
import { FieldRow } from '@/panels/shared/Section';
import { useIconStore } from '../store';
import { androidThemedSvg, iosAppearanceSvg, safeTint, type IosAppearance } from '../themedPreview';

const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Home-screen backdrops behind the previews (fixed colours: they stand for a wallpaper, not the UI theme). */
const WALL = { light: '#e9e6df', dark: '#141414' } as const;

function Tile({ url, label, wall }: { url: string; label: string; wall: string }) {
  return (
    <figure className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="flex w-full justify-center rounded-md border p-3" style={{ background: wall }}>
        <img src={url} alt={`${label} (approximation)`} width={56} height={56} className="size-14" draggable={false} />
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

const IOS: { id: IosAppearance; label: string; wall: string }[] = [
  { id: 'light', label: 'Light', wall: WALL.light },
  { id: 'dark', label: 'Dark', wall: WALL.dark },
  { id: 'tinted', label: 'Tinted', wall: WALL.dark },
];

/**
 * How the OS recolours the icon: Android 13+ themed icons (monochrome layer on a tonal shape) and
 * iOS 18 Light / Dark / Tinted. Approximations of the system rendering; the tint stands for the
 * iOS tint colour and the Android wallpaper accent.
 */
export function ThemedPreview({ sources }: { sources: IconSources }) {
  const tint = useIconStore((s) => s.tint);
  const setPrefs = useIconStore((s) => s.setPrefs);
  const urls = useMemo(
    () => ({
      android: [
        { label: 'Light', wall: WALL.light, url: dataUrl(androidThemedSvg(sources, tint, false)) },
        { label: 'Dark', wall: WALL.dark, url: dataUrl(androidThemedSvg(sources, tint, true)) },
      ],
      ios: IOS.map((a) => ({ ...a, url: dataUrl(iosAppearanceSvg(sources, a.id, tint)) })),
    }),
    [sources, tint],
  );
  return (
    <div className="flex flex-col gap-3" aria-label="System theme previews">
      <FieldRow label="Tint">
        <ColorField value={tint} showAlpha={false} ariaLabel="Tint colour for the themed previews" onChange={(c) => setPrefs({ tint: safeTint(c.slice(0, 7)) })} />
      </FieldRow>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Android 13+ themed</span>
        <div className="grid grid-cols-2 gap-2">
          {urls.android.map((t) => (
            <Tile key={t.label} {...t} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">iOS 18+ appearances</span>
        <div className="grid grid-cols-3 gap-2">
          {urls.ios.map((t) => (
            <Tile key={t.id} url={t.url} label={t.label} wall={t.wall} />
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Approximations: Android and iOS render these themselves. The tint stands for the iOS tint colour and the Android wallpaper accent.</p>
    </div>
  );
}
