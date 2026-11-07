import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { getSelectionFrame, handlePosition, rotationHandlePosition } from '../selectionFrame';
import { useView } from './useView';

const HANDLE = 8;

/** Selection box; resize + rotation handles only for the select tool. */
export function SelectionOverlay() {
  const doc = useDocStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const tool = useEditorStore((s) => s.tool);
  const busy = useDocStore((s) => !!s.txn);
  const { toScreen, zoom } = useView();
  if (!selection.length) return null;
  const frame = getSelectionFrame(doc, selection);
  if (!frame) return null;
  const corners = frame.corners.map(toScreen);
  const showHandles = tool === 'select';
  const tiny = frame.width * zoom < 16 || frame.height * zoom < 16;
  const top = toScreen(handlePosition(frame, 1));
  const rot = toScreen(rotationHandlePosition(frame, zoom));
  return (
    <g pointerEvents="none">
      <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth={1} />
      {showHandles && !busy && (
        <>
          <line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} stroke="var(--primary)" strokeWidth={1} />
          <circle cx={rot.x} cy={rot.y} r={HANDLE / 2 + 1} fill="var(--card)" stroke="var(--primary)" strokeWidth={1.5} />
          {Array.from({ length: 8 }, (_, i) => {
            if (tiny && i % 2 === 1) return null;
            const p = toScreen(handlePosition(frame, i));
            return (
              <rect
                key={i}
                x={-HANDLE / 2}
                y={-HANDLE / 2}
                width={HANDLE}
                height={HANDLE}
                rx={1.5}
                transform={`translate(${p.x} ${p.y}) rotate(${frame.rotation})`}
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth={1.5}
              />
            );
          })}
        </>
      )}
    </g>
  );
}
