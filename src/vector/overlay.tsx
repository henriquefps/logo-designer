// Screen-space drawing helpers for the vector tools' overlays.
import { subpathsToD, type Matrix, type SubPath, type Vec } from '@/model';
import { transformSubpaths } from './geometry';

export const ANCHOR_PX = 7;
export const HANDLE_PX = 6;

export function PathOutline({ subpaths, m, dashed }: { subpaths: SubPath[]; m: Matrix; dashed?: boolean }) {
  return (
    <path
      d={subpathsToD(transformSubpaths(subpaths, m))}
      fill="none"
      stroke="var(--primary)"
      strokeWidth={1}
      strokeDasharray={dashed ? '4 3' : undefined}
    />
  );
}

export function Anchor({ p, selected, smooth }: { p: Vec; selected?: boolean; smooth?: boolean }) {
  const s = ANCHOR_PX;
  const fill = selected ? 'var(--primary)' : 'var(--card)';
  return smooth ? (
    <circle cx={p.x} cy={p.y} r={s / 2 + 0.5} fill={fill} stroke="var(--primary)" strokeWidth={1.5} />
  ) : (
    <rect x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} fill={fill} stroke="var(--primary)" strokeWidth={1.5} />
  );
}

export function Handle({ anchor, handle }: { anchor: Vec; handle: Vec }) {
  return (
    <g>
      <line x1={anchor.x} y1={anchor.y} x2={handle.x} y2={handle.y} stroke="var(--primary)" strokeWidth={1} />
      <circle cx={handle.x} cy={handle.y} r={HANDLE_PX / 2} fill="var(--card)" stroke="var(--primary)" strokeWidth={1.5} />
    </g>
  );
}
