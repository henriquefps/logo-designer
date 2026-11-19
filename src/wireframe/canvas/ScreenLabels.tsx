import { platformDef, screenNodes } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from '@/canvas/overlays/useView';
import { STATUS_LABELS, screenStatus } from '../flows';

/** Rough width of a 12 px Inter label (the overlay is not measured). */
const labelWidth = (s: string, weight = 400) => s.length * (weight >= 500 ? 7 : 6.6);

/** Screen names above the frames of a wireframe document (screen space, constant size). */
export function ScreenLabels() {
  const doc = useDocStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const { toScreen, zoom } = useView();
  if (!doc.wireframe) return null;
  return (
    <g aria-hidden="true" data-slot="screen-labels" fontSize={12} fontFamily="var(--font-sans, Inter, sans-serif)">
      {screenNodes(doc).map((f) => {
        if (!f.visible) return null;
        const p = toScreen({ x: f.transform.x, y: f.transform.y });
        const w = f.screen.width * zoom;
        if (w < 24) return null;
        const selected = selection.includes(f.id);
        const detail = `${platformDef(f.screen.platform).label} · ${Math.round(f.screen.width)}`;
        const status = screenStatus(doc, f.screen.screenId);
        const badge = status && w > 90 ? STATUS_LABELS[status] : null;
        const badgeW = badge ? Math.ceil(labelWidth(badge, 500) * (10 / 12)) + 12 : 0;
        // Right-aligned on the frame's label strip: no need to measure the name.
        const bx = p.x + w - badgeW;
        return (
          <g key={f.id}>
            <text x={p.x} y={p.y - 7} fill={selected ? 'var(--primary)' : 'var(--muted-foreground)'}>
              <tspan fontWeight={500} fill={selected ? 'var(--primary)' : 'var(--foreground)'}>
                {f.name}
              </tspan>
              {w > (badge ? 240 : 140) && <tspan dx={6}>{detail}</tspan>}
            </text>
            {badge && (
              <g data-slot="screen-status" data-status={status}>
                <rect
                  x={bx}
                  y={p.y - 19}
                  width={badgeW}
                  height={15}
                  rx={7.5}
                  fill={status === 'current' ? 'var(--background)' : 'var(--foreground)'}
                  stroke="var(--foreground)"
                  strokeWidth={1}
                  strokeDasharray={status === 'new' ? '3 2' : undefined}
                  fillOpacity={status === 'new' ? 0 : 1}
                />
                <text x={bx + badgeW / 2} y={p.y - 8} fontSize={10} fontWeight={600} textAnchor="middle" fill={status === 'changed' ? 'var(--background)' : 'var(--foreground)'}>
                  {badge}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
