import { useEffect, useMemo, useState } from 'react';
import { keylineGuides, REFERENCE_PINK, type KeylineGuide } from '@/icon';
import { useView } from '@/canvas/overlays/useView';
import { useDocStore } from '@/store/useDocStore';
import { startIconAnalysis } from '../analysis';
import { useIconStore } from '../store';

const SAFE = '#ffb020';

/**
 * Keyline guides of an icon document, in screen space over the canvas (never document nodes,
 * so always locked). Hovering a line shows its label. Also starts the live measurement.
 */
export function IconKeylinesOverlay() {
  const icon = useDocStore((s) => s.doc.icon);
  const artboard = useDocStore((s) => s.doc.artboard);
  const show = useIconStore((s) => s.showKeylines);
  const onTile = useIconStore((s) => s.showTile && !s.light);
  const { toScreen, zoom } = useView();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const preset = icon?.preset;
  const guides = useMemo(() => (preset ? keylineGuides(preset, artboard) : []), [preset, artboard]);

  // One measurement loop while an icon document is open.
  const isIcon = !!icon;
  useEffect(() => (isIcon ? startIconAnalysis() : undefined), [isIcon]);

  if (!icon || !show) return null;
  const line = onTile ? 'rgba(255,255,255,0.75)' : 'var(--primary)';
  const tone = (g: KeylineGuide) => (g.kind === 'circle' ? (g.tone === 'reference' ? REFERENCE_PINK : g.tone === 'safe' ? SAFE : line) : line);
  const label = hover ? guides.find((g) => g.id === hover.id)?.label : null;

  const track = (id: string) => (e: React.PointerEvent<SVGElement>) => {
    const box = (e.currentTarget as SVGGraphicsElement).ownerSVGElement?.getBoundingClientRect();
    setHover({ id, x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) });
  };

  const shape = (g: KeylineGuide, hit: boolean) => {
    const common = {
      fill: 'none',
      stroke: hit ? 'transparent' : tone(g),
      strokeWidth: hit ? 9 : hover?.id === g.id ? 2 : 1,
      strokeDasharray: !hit && 'dashed' in g && g.dashed ? '4 3' : undefined,
      pointerEvents: hit ? ('stroke' as const) : ('none' as const),
      onPointerEnter: hit ? track(g.id) : undefined,
      onPointerMove: hit ? track(g.id) : undefined,
      onPointerLeave: hit ? () => setHover(null) : undefined,
    };
    if (g.kind === 'circle') {
      const c = toScreen({ x: g.cx, y: g.cy });
      return <circle key={g.id + hit} cx={c.x} cy={c.y} r={g.r * zoom} {...common} />;
    }
    const a = toScreen({ x: g.x, y: g.y });
    return <rect key={g.id + hit} x={a.x} y={a.y} width={g.w * zoom} height={g.h * zoom} rx={g.kind === 'tile' ? g.rx * zoom : undefined} {...common} />;
  };

  return (
    <g data-slot="icon-keylines" aria-hidden="true">
      {guides.map((g) => shape(g, false))}
      {guides.map((g) => shape(g, true))}
      {hover && label && (
        <foreignObject x={hover.x + 12} y={hover.y + 12} width={320} height={40} pointerEvents="none">
          <div className="inline-block rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm">{label}</div>
        </foreignObject>
      )}
    </g>
  );
}
