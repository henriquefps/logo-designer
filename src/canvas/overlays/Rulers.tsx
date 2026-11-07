import { useEditorStore } from '@/store/useEditorStore';
import { useView } from './useView';

const RULER_PX = 22;

/** Nice tick spacing (1, 2, 5 × 10ⁿ document units) with at least `minPx` screen pixels between labels. */
function rulerStep(zoom: number, minPx = 64): number {
  const raw = minPx / zoom;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

const fmt = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

function Ruler({ axis }: { axis: 'x' | 'y' }) {
  const { zoom, pan } = useView();
  const viewport = useEditorStore((s) => s.viewport);
  const pointer = useEditorStore((s) => s.pointer);
  const length = axis === 'x' ? viewport.width : viewport.height;
  const offset = axis === 'x' ? pan.x : pan.y;
  const step = rulerStep(zoom);
  const minor = step / 10;
  const startDoc = (RULER_PX - offset) / zoom;
  const endDoc = (length - offset) / zoom;
  let ticks = '';
  const labels: { pos: number; text: string }[] = [];
  const first = Math.floor(startDoc / minor) * minor;
  for (let i = 0, v = first; v <= endDoc && i < 2000; i++, v = first + i * minor) {
    const s = Math.round(v * zoom + offset) + 0.5;
    if (s < RULER_PX) continue;
    const k = Math.round(v / minor);
    const isMajor = k % 10 === 0;
    const isHalf = k % 5 === 0;
    const h = isMajor ? RULER_PX : isHalf ? 8 : 4;
    ticks += axis === 'x' ? `M${s} ${RULER_PX}v${-h}` : `M${RULER_PX} ${s}h${-h}`;
    if (isMajor) labels.push({ pos: s, text: fmt(k * minor) });
  }
  const marker = pointer ? Math.round((axis === 'x' ? pointer.x : pointer.y) * zoom + offset) + 0.5 : null;
  const horizontal = axis === 'x';
  return (
    <svg
      aria-hidden="true"
      className="absolute overflow-hidden bg-card text-muted-foreground"
      style={horizontal ? { left: 0, top: 0, width: length, height: RULER_PX } : { left: 0, top: 0, width: RULER_PX, height: length }}
    >
      <path d={ticks} stroke="currentColor" strokeWidth={1} opacity={0.6} fill="none" />
      {labels.map((l) =>
        horizontal ? (
          <text key={l.pos} x={l.pos + 3} y={12} fontSize={12} fill="currentColor" className="tabular-nums">
            {l.text}
          </text>
        ) : (
          <text key={l.pos} x={12} y={l.pos + 3} fontSize={12} fill="currentColor" transform={`rotate(-90 12 ${l.pos + 3})`} textAnchor="end" className="tabular-nums">
            {l.text}
          </text>
        ),
      )}
      {marker !== null && marker >= RULER_PX && (
        <path d={horizontal ? `M${marker} 0V${RULER_PX}` : `M0 ${marker}H${RULER_PX}`} stroke="var(--primary)" strokeWidth={1} />
      )}
      <path d={horizontal ? `M0 ${RULER_PX - 0.5}H${length}` : `M${RULER_PX - 0.5} 0V${length}`} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}

/** Illustrator-style rulers along the top and left canvas edges (document units, origin = artboard top-left). */
export function Rulers() {
  const show = useEditorStore((s) => s.showRulers);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0" data-slot="rulers">
      <Ruler axis="x" />
      <Ruler axis="y" />
      <div className="absolute top-0 left-0 border-r border-b bg-card" style={{ width: RULER_PX, height: RULER_PX }} />
    </div>
  );
}
