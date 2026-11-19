import { platformDef, screenNodes } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useView } from '@/canvas/overlays/useView';

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
        return (
          <text key={f.id} x={p.x} y={p.y - 7} fill={selected ? 'var(--primary)' : 'var(--muted-foreground)'}>
            <tspan fontWeight={500} fill={selected ? 'var(--primary)' : 'var(--foreground)'}>
              {f.name}
            </tspan>
            {w > 140 && <tspan dx={6}>{detail}</tspan>}
          </text>
        );
      })}
    </g>
  );
}
