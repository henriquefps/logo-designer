import type { MarqueeRect } from '@/hooks/useCanvasDrag';

export function MarqueeSelect({ rect }: { rect: MarqueeRect | null }) {
  if (!rect) return null;
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill="color-mix(in oklch, var(--color-primary) 12%, transparent)"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      style={{ stroke: 'var(--color-primary)' }}
      pointerEvents="none"
    />
  );
}
