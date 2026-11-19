import type { ReactNode } from 'react';
import type { GroupNode } from '@/model';
import { cssFontStack } from '@/fonts';
import { containerBackground, EMPTY_LABEL, isEmptyContainer } from '../containers';
import { WF, WF_CONTAINER } from '../style';

/** A styled container's background (outline / fill, radius), under its children. Same shape as the SVG export's. */
export function ContainerBackground({ node }: { node: GroupNode }) {
  const bg = containerBackground(node);
  if (!bg) return null;
  const inset = bg.stroke ? 0.5 : 0;
  return (
    <rect
      x={inset}
      y={inset}
      width={Math.max(0, bg.width - 2 * inset)}
      height={Math.max(0, bg.height - 2 * inset)}
      rx={bg.radius > 0 ? Math.max(0, bg.radius - inset) : undefined}
      fill={bg.fill ?? 'none'}
      stroke={bg.stroke ?? undefined}
      strokeWidth={bg.stroke ? WF.strokeWidth : undefined}
    />
  );
}

/**
 * An empty stack / grid on the canvas: a dashed outline with "Drop elements here", so it can be
 * seen and targeted. Canvas only: the SVG / PNG export and the export for AI never show it.
 */
export function EmptyContainerPlaceholder({ node }: { node: GroupNode }) {
  const size = node.layout?.size;
  if (!size || !isEmptyContainer(node)) return null;
  const { width, height } = size;
  return (
    <g pointerEvents="none" data-placeholder="empty-container">
      <rect x={0.5} y={0.5} width={Math.max(0, width - 1)} height={Math.max(0, height - 1)} rx={4} fill="none" stroke={WF_CONTAINER.placeholderStroke} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      {width >= 90 && height >= 20 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fontFamily={cssFontStack(WF.font)} fontSize={12} fill={WF_CONTAINER.placeholderInk}>
          {EMPTY_LABEL}
        </text>
      )}
    </g>
  );
}

/** A stack / grid: background, children, and the placeholder when it is empty. */
export function ContainerRenderer({ node, children }: { node: GroupNode; children: ReactNode }) {
  return (
    <>
      <ContainerBackground node={node} />
      {children}
      <EmptyContainerPlaceholder node={node} />
    </>
  );
}
