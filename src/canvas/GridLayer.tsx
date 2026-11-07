import { useEditorStore } from '@/store/useEditorStore';
import { useDocStore } from '@/store/useDocStore';
import { useView } from './overlays/useView';

/** Minimum on-screen spacing of drawn grid lines; denser grids draw every 2nd/4th… line. */
const MIN_PX = 8;

/**
 * Document grid over the artboard (screen space, crisp 1px lines), drawn above the artboard
 * background and under the artwork. Every 4th line is stronger.
 */
export function GridLayer() {
  const show = useEditorStore((s) => s.showGrid);
  const size = useEditorStore((s) => s.gridSize);
  const viewport = useEditorStore((s) => s.viewport);
  const artboard = useDocStore((s) => s.doc.artboard);
  const { zoom, pan } = useView();
  if (!show || size <= 0) return null;
  let step = size;
  let skip = 1;
  while (step * zoom < MIN_PX && skip < 1 << 20) {
    step *= 2;
    skip *= 2;
  }
  // Visible part of the artboard in document units.
  const x0 = Math.max(0, -pan.x / zoom);
  const y0 = Math.max(0, -pan.y / zoom);
  const x1 = Math.min(artboard.width, (viewport.width - pan.x) / zoom);
  const y1 = Math.min(artboard.height, (viewport.height - pan.y) / zoom);
  if (x1 <= x0 || y1 <= y0) return null;
  const sx = (x: number) => Math.round(x * zoom + pan.x) + 0.5;
  const sy = (y: number) => Math.round(y * zoom + pan.y) + 0.5;
  let minor = '';
  let major = '';
  const majorEvery = size * 4;
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const seg = `M${sx(x)} ${sy(y0)}V${sy(y1)}`;
    if (Math.abs(x / majorEvery - Math.round(x / majorEvery)) < 1e-9) major += seg;
    else minor += seg;
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const seg = `M${sx(x0)} ${sy(y)}H${sx(x1)}`;
    if (Math.abs(y / majorEvery - Math.round(y / majorEvery)) < 1e-9) major += seg;
    else minor += seg;
  }
  return (
    <g pointerEvents="none" aria-hidden="true" data-slot="grid">
      <path d={minor} stroke="var(--primary)" strokeOpacity={0.12} strokeWidth={1} fill="none" />
      <path d={major} stroke="var(--primary)" strokeOpacity={0.28} strokeWidth={1} fill="none" />
    </g>
  );
}
